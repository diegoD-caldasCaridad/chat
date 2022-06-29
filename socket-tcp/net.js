import { Server } from "../Server.1";
import { Stream } from "./Stream";

let debugLevel = 0;
if ('NODE_DEBUG' in process.ENV) debugLevel = 1;
export function debug (x) {
  if (debugLevel > 0) {
    process.stdio.writeError(x + '\n');
  }
}

export let assert      = process.assert;
let connect     = process.connect;
export let accept      = process.accept;
let close       = process.close;
let shutdown    = process.shutdown;
export let read        = process.read;
let write       = process.write;
let toRead      = process.toRead;
let socketError = process.socketError;
let EINPROGRESS = process.EINPROGRESS;

process.inherits(Stream, process.EventEmitter);

const _Stream = Stream;
export { _Stream as Stream };

Stream.prototype._allocateNewRecvBuf = function () {
  let self = this;

  let  newBufferSize = 1024; // TODO make this adjustable from user API

  if (toRead) {
    // Note: only Linux supports toRead().
    // Is the extra system call even worth it?
    let bytesToRead = toRead(self.fd);
    if (bytesToRead > 1024) {
      newBufferSize = 4*1024;
    } else if (bytesToRead == 0) {
      // Probably getting an EOF - so let's not allocate so much.
      if (self.recvBuffer &&
          self.recvBuffer.length - self.recvBuffer.used > 0) {
        return; // just recv the eof on the old buf.
      }
      newBufferSize = 128;
    }
  }

  self.recvBuffer = new process.Buffer(newBufferSize);
  self.recvBuffer.used = 0;
};

Stream.prototype._allocateSendBuffer = function () {
  let b = new process.Buffer(1024);
  b.used = 0;
  b.sent = 0;
  this.sendQueue.push(b);
  return b;
};

Stream.prototype._sendString = function (data, encoding) {
  let self = this;
  if (!self.writable) throw new Error('Stream is not writable');
  let buffer;
  if (self.sendQueue.length == 0) {
    buffer = self._allocateSendBuffer();
  } else {
    // walk through the sendQueue, find the buffer with free space
    for (let i = 0; i < self.sendQueue.length; i++) {
      if (self.sendQueue[i].used == 0) {
        buffer = self.sendQueue[i];
        break;
      }
    }
    // if we didn't find one, take the last
    if (!buffer) {
      buffer = self.sendQueue[self.sendQueue.length-1];
      // if last buffer is used up
      if (buffer.length == buffer.used) buffer = self._allocateSendBuffer();
    }
  }

  encoding = encoding || 'ascii'; // default to ascii since it's faster

  let charsWritten;
  let bytesWritten;

  if (encoding.toLowerCase() == 'utf8') {
    charsWritten = buffer.utf8Write(data,
                                    buffer.used,
                                    buffer.length - buffer.used);
    bytesWritten = process.Buffer.utf8Length(data.slice(0, charsWritten));
  } else {
    // ascii
    charsWritten = buffer.asciiWrite(data,
                                     buffer.used,
                                     buffer.length - buffer.used);
    bytesWritten = charsWritten;
  }
  
  buffer.used += bytesWritten;
  self.sendQueueSize += bytesWritten;

  debug('charsWritten ' + charsWritten);
  debug('buffer.used ' + buffer.used);

  // If we didn't finish, then recurse with the rest of the string.
  if (charsWritten < data.length) {
    debug('recursive send');
    self._sendString(data.slice(charsWritten), encoding);
  }
};

// Returns true if all the data was flushed to socket. Returns false if
// something was queued. If data was queued, then the "drain" event will
// signal when it has been finally flushed to socket.
Stream.prototype.send = function (data, encoding) {
  let self = this;
  if (!self.writable) throw new Error('Stream is not writable');
  if (typeof(data) == 'string') {
    self._sendString(data, encoding);
  } else {
    // data is a process.Buffer
    // walk through the sendQueue, find the first empty buffer
    let inserted = false;
    data.sent = 0;
    data.used = data.length;
    for (let i = 0; i < self.sendQueue.length; i++) {
      if (self.sendQueue[i].used == 0) {
        // if found, insert the data there
        self.sendQueue.splice(i, 0, data);
        inserted = true;
        break;
      }
    }

    if (!inserted) self.sendQueue.push(data);

    self.sendQueueSize += data.used;
  }
  return this.flush();
};

// Flushes the write buffer out. Emits "drain" if the buffer is empty.
Stream.prototype.flush = function () {
  let self = this;
  if (!self.writable) throw new Error('Stream is not writable');

  let bytesWritten;
  while (self.sendQueue.length > 0) {
    let b = self.sendQueue[0];

    if (b.sent == b.used) {
      // this can be improved - save the buffer for later?
      self.sendQueue.shift()
      continue;
    }

    bytesWritten = write(self.fd,
                         b,
                         b.sent,
                         b.used - b.sent);
    if (bytesWritten === null) {
      // could not flush everything
      self.writeWatcher.start();
      assert(self.sendQueueSize > 0);
      return false;
    }
    b.sent += bytesWritten;
    self.sendQueueSize -= bytesWritten;
    debug('bytes sent: ' + b.sent);
  }
  self.writeWatcher.stop();
  return true;
};

// let stream = new Stream();
// stream.connect(80)               - TCP connect to port 80 on the localhost
// stream.connect(80, 'nodejs.org') - TCP connect to port 80 on nodejs.org
// stream.connect('/tmp/socket')    - UNIX connect to socket specified by path
Stream.prototype.connect = function () {
  let self = this;
  if (self.fd) throw new Error('Stream already opened');

  if (typeof(arguments[0]) == 'string' && arguments.length == 1) {
    self.fd = process.socket('UNIX');
    // TODO check if sockfile exists?
  } else {
    self.fd = process.socket('TCP');
    // TODO dns resolution on arguments[1]
  }

  try {
    connect(self.fd, arguments[0], arguments[1]);
  } catch (e) {
    close(self.fd);
    throw e;
  }

  // Don't start the read watcher until connection is established
  self.readWatcher.set(self.fd, true, false);

  // How to connect on POSIX: Wait for fd to become writable, then call
  // socketError() if there isn't an error, we're connected. AFAIK this a
  // platform independent way determining when a non-blocking connection
  // is established, but I have only seen it documented in the Linux
  // Manual Page connect(2) under the error code EINPROGRESS.
  self.writeWatcher.set(self.fd, false, true);
  self.writeWatcher.start();
  self.writeWatcher.callback = function () {
    let errno = socketError(self.fd);
    if (errno == 0) {
      // connection established
      self.readWatcher.start();
      self.readable = true;
      self.writable = true;
      self.writeWatcher.callback = self._doFlush;
      self.emit('connect');
    } else if (errno != EINPROGRESS) {
      let e = new Error('connection error');
      e.errno = errno;
      self.forceClose(e);
    }
  };
};

Stream.prototype.forceClose = function (exception) {
  if (this.fd) {
    this.readable = false;
    this.writable = false;

    this.writeWatcher.stop();
    this.readWatcher.stop();
    close(this.fd);
    debug('close peer ' + this.fd);
    this.fd = null;
    this.emit('close', exception); 
  }
};

Stream.prototype._shutdown = function () {
  if (this.writable) {
    this.writable = false;
    shutdown(this.fd, "write");
  }
};

Stream.prototype.close = function () {
  let self = this;
  let closeMethod;
  if (self.readable && self.writable) {
    closeMethod = self._shutdown;
  } else if (!self.readable && self.writable) {
    // already got EOF
    closeMethod = self.forceClose;
  }
  // In the case we've already shutdown write side, 
  // but haven't got EOF: ignore. In the case we're
  // fully closed already: ignore.

  if (closeMethod) {
    if (self.sendQueueSize == 0) {
      // no queue. just shut down the socket.
      closeMethod();
    } else {
      self.addListener("drain", closeMethod);
    }
  }
};

process.inherits(Server, process.EventEmitter);
