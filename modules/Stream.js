import { debug, read, assert } from "../net";

export class Stream {
  constructor(peerInfo) {
    process.EventEmitter.call();

    var self = this;

    // Allocated on demand.
    self.recvBuffer = null;

    self.readWatcher = new process.IOWatcher(function () {
      // If this is the first recv (recvBuffer doesn't exist) or we've used up
      // most of the recvBuffer, allocate a new one.
      if (!self.recvBuffer ||
        self.recvBuffer.length - self.recvBuffer.used < 128) {
        self._allocateNewRecvBuf();
      }

      debug('recvBuffer.used ' + self.recvBuffer.used);
      var bytesRead = read(self.fd,
        self.recvBuffer,
        self.recvBuffer.used,
        self.recvBuffer.length - self.recvBuffer.used);
      debug('bytesRead ' + bytesRead + '\n');

      if (bytesRead == 0) {
        self.readable = false;
        self.readWatcher.stop();
        self.emit('eof');
        if (!self.writable)
          self.forceClose();
      } else {
        var slice = self.recvBuffer.slice(self.recvBuffer.used,
          self.recvBuffer.used + bytesRead);
        self.recvBuffer.used += bytesRead;
        self.emit('receive', slice);
      }
    });
    self.readable = false;

    self.sendQueue = []; // queue of buffers that need to be written to socket


    // XXX use link list? 
    self.sendQueueSize = 0; // in bytes, not to be confused with sendQueue.length!
    self._doFlush = function () {
      assert(self.sendQueueSize > 0);
      if (self.flush()) {
        assert(self.sendQueueSize == 0);
        self.emit("drain");
      }
    };
    self.writeWatcher = new process.IOWatcher(self._doFlush);
    self.writable = false;

    if (peerInfo) {
      self.fd = peerInfo.fd;
      self.remoteAddress = peerInfo.remoteAddress;
      self.remotePort = peerInfo.remotePort;

      self.readWatcher.set(self.fd, true, false);
      self.readWatcher.start();
      self.readable = true;

      self.writeWatcher.set(self.fd, false, true);
      self.writable = true;
    }
  }
}
