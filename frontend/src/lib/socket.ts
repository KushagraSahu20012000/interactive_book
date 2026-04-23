import { io } from "socket.io-client";
import { BACKEND_URL } from "./api";

export const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 800
});
