import { Stream } from "./Stream";


export function createConnection(port, host) {
  var s = new Stream();
  s.connect(port, host);
  return s;
}
