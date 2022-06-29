import { accept, debug, Stream } from "./net";

export class Server {
  constructor(listener) {
    var self = this;

    if (listener) {
      self.addListener('connection', listener);
    }

    self.watcher = new process.IOWatcher(function (readable, writeable) {
      while (self.fd) {
        var peerInfo = accept(self.fd);
        debug('accept: ' + JSON.stringify(peerInfo));
        if (!peerInfo)
          return;
        var peer = new Stream(peerInfo);
        self.emit('connection', peer);
      }
    });
  }
}

