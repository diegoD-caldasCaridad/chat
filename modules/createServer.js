import { Server } from "../Server.1";

export function createServer(listener) {
  return new Server(listener);
}
