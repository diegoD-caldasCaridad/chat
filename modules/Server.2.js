const _Server = _Server;
export { _Server as Server };

    _Server.prototype.listen = function () {
  var self = this;
  if (self.fd) throw new Error('Server already opened');

  if (typeof(arguments[0]) == 'string' && arguments.length == 1) {
    // the first argument specifies a path
    self.fd = process.socket('UNIX');
    self.type = 'UNIX';
    // TODO unlink sockfile if exists?
    // if (lstat(SOCKFILE, &tstat) == 0) {
    //   assert(S_ISSOCK(tstat.st_mode));
    //   unlink(SOCKFILE);
    // }
    bind(self.fd, arguments[0]);
  } else if (arguments.length == 0) {
    self.fd = process.socket('TCP');
    self.type = 'TCP';
    // Don't bind(). OS will assign a port with INADDR_ANY. The port will be
    // passed to the 'listening' event.
  } else {
    // the first argument is the port, the second an IP
    self.fd = process.socket('TCP');
    self.type = 'TCP';
    // TODO dns resolution on arguments[1]
    bind(self.fd, arguments[0], arguments[1]);
  }

  listen(self.fd, 128);
  self.emit("listening");

  self.watcher.set(self.fd, true, false); 
  self.watcher.start();
};

_Server.prototype.sockName = function () {
  return getSockName(self.fd);
};

_Server.prototype.close = function () {
  if (!this.fd) throw new Error('Not running');
  this.watcher.stop();
  close(this.fd);
  this.fd = null;
  this.emit("close");
};