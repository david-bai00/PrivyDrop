import { Server } from "socket.io";
import { CONFIG } from "../config/env";
import * as roomService from "../services/room";
import { checkRateLimit } from "../services/rateLimit";
import {
  setupSocketHandlers as setupSocketHandlersCore,
  type SocketHandlerDependencies,
} from "./handlersCore";
export type { SocketHandlerDependencies } from "./handlersCore";

const defaultDependencies: SocketHandlerDependencies = {
  getRoomBySocketId: roomService.getRoomBySocketId,
  isRoomExist: roomService.isRoomExist,
  bindSocketToRoom: roomService.bindSocketToRoom,
  refreshRoom: roomService.refreshRoom,
  unbindSocketFromRoom: roomService.unbindSocketFromRoom,
  isRoomEmpty: roomService.isRoomEmpty,
  checkRateLimit,
  disableJoinRateLimit: CONFIG.DISABLE_JOIN_RATE_LIMIT,
};
// Room Management:
// Use roomId to broadcast messages (socket.to(roomId).emit())
// Scenarios: Notifying new user joined, room status updates, etc.
// WebRTC Signaling:
// Use peerId for peer-to-peer communication (socket.to(peerId).emit())
// Scenarios: All signaling during WebRTC connection setup, like offer, answer, ice-candidate.
export function setupSocketHandlers(
  io: Server,
  dependencies: SocketHandlerDependencies = defaultDependencies
): void {
  setupSocketHandlersCore(io as never, dependencies);
}
