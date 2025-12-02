import { Server, Socket } from "socket.io";
import * as roomService from "../services/room";
import {
  JoinData,
  SignalingData,
  InitiatorData,
  RecipientData,
} from "../types/socket";
import { checkRateLimit } from "../services/rateLimit";
// Room Management:
// Use roomId to broadcast messages (socket.to(roomId).emit())
// Scenarios: Notifying new user joined, room status updates, etc.
// WebRTC Signaling:
// Use peerId for peer-to-peer communication (socket.to(peerId).emit())
// Scenarios: All signaling during WebRTC connection setup, like offer, answer, ice-candidate.
export function setupSocketHandlers(io: Server): void {
  const DEBUG_ROOM_ID = "155533333ffff";
  const DBG_PREFIX = "[PD-ROOM-DEBUG]";
  io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    socket.on("join", async (data: JoinData) => {
      const { roomId: targetRoomId } = data; // Renamed for clarity
      try {
        // Get client IP
        const clientIp =
          socket.handshake.headers["x-forwarded-for"] ||
          socket.handshake.address;
        // Check rate limit
        const rateLimitCheck = await checkRateLimit(clientIp as string);
        if (!rateLimitCheck.allowed) {
          socket.emit("joinResponse", {
            success: false,
            message: `Rate limit exceeded. Try again in ${rateLimitCheck.resetAfter}s. Attempts left: ${rateLimitCheck.remaining}.`,
            roomId: targetRoomId,
          });
          return;
        }
        const targetRoomExists = await roomService.isRoomExist(targetRoomId);
        if (!targetRoomExists) {
          socket.emit("joinResponse", {
            success: false,
            message: "Room does not exist",
            roomId: targetRoomId,
          });
          return;
        }

        const existingRoomId = await roomService.getRoomBySocketId(socket.id);
        if (!existingRoomId) {
          // Only allow new connection to join if the socket.id is not already in a room
          socket.join(targetRoomId);
          console.log(`Client ${socket.id} joined room ${targetRoomId}`);
          await roomService.bindSocketToRoom(socket.id, targetRoomId);
        }

        await roomService.refreshRoom(targetRoomId);
        // Notify the user that the join was successful
        socket.emit("joinResponse", {
          success: true,
          message: "Successfully joined room",
          roomId: targetRoomId,
        });
        if (targetRoomId === DEBUG_ROOM_ID)
          console.log(`${DBG_PREFIX} [sig] join ok socket:${socket.id} room:${targetRoomId}`);
        // Notify all other users in the room that a new member has joined
        socket.to(targetRoomId).emit("ready", { peerId: socket.id });
        if (targetRoomId === DEBUG_ROOM_ID)
          console.log(`${DBG_PREFIX} [sig] ready broadcast room:${targetRoomId} from:${socket.id}`);
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("joinResponse", {
          success: false,
          message: "Server error while joining room",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
    // Handle WebRTC signaling - direct forwarding
    // offer, answer, ice-candidate: These events handle WebRTC connection signaling. They are responsible for forwarding connection requests and network negotiation messages between clients.
    // offer: When a client initiates a connection request, it sends an offer to the server, which forwards it to other clients in the same room.
    // answer: The invited client receives the offer, generates an answer, and sends it back to the initiating client via the server.
    // ice-candidate: When WebRTC needs to traverse NAT firewalls, it generates ICE candidates. Clients exchange this information through the server to help establish a P2P connection.
    socket.on("offer", async (data: SignalingData) => {
      socket.to(data.peerId).emit("offer", {
        offer: data.offer,
        from: data.from,
        peerId: socket.id, // Sender's ID
      });
      try {
        const r = await roomService.getRoomBySocketId(socket.id);
        if (r === DEBUG_ROOM_ID)
          console.log(`${DBG_PREFIX} [sig] offer from:${socket.id} -> to:${data.peerId} room:${r || "?"}`);
      } catch (_) {}
    });

    socket.on("answer", async (data: SignalingData) => {
      socket.to(data.peerId).emit("answer", {
        answer: data.answer,
        from: data.from,
        peerId: socket.id,
      });
      try {
        const r = await roomService.getRoomBySocketId(socket.id);
        if (r === DEBUG_ROOM_ID)
          console.log(`${DBG_PREFIX} [sig] answer from:${socket.id} -> to:${data.peerId} room:${r || "?"}`);
      } catch (_) {}
    });

    socket.on("ice-candidate", async (data: SignalingData) => {
      socket.to(data.peerId).emit("ice-candidate", {
        candidate: data.candidate,
        from: data.from,
        peerId: socket.id,
      });
      try {
        const r = await roomService.getRoomBySocketId(socket.id);
        if (r === DEBUG_ROOM_ID)
          console.log(`${DBG_PREFIX} [sig] candidate from:${socket.id} -> to:${data.peerId} room:${r || "?"}`);
      } catch (_) {}
    });
    // Handle notification for initiator coming back online -- broadcast to other users in the room
    socket.on("initiator-online", (data: InitiatorData) => {
      socket.to(data.roomId).emit("initiator-online", {
        roomId: data.roomId,
      });
      if (data.roomId === DEBUG_ROOM_ID)
        console.log(`${DBG_PREFIX} [sig] initiator-online room:${data.roomId} from:${socket.id}`);
    });
    // Handle recipient's response
    socket.on("recipient-ready", (data: RecipientData) => {
      socket.to(data.roomId).emit("recipient-ready", {
        peerId: data.peerId,
      });
      if (data.roomId === DEBUG_ROOM_ID)
        console.log(`${DBG_PREFIX} [sig] recipient-ready room:${data.roomId} peer:${data.peerId}`);
    });

    socket.on("disconnect", async () => {
      console.log("Disconnected:", socket.id);
      const roomId = await roomService.getRoomBySocketId(socket.id);
      if (roomId) {
        // Notify other users in the room that this peer has left
        socket.to(roomId).emit("peer-disconnected", { peerId: socket.id });
        if (roomId === DEBUG_ROOM_ID)
          console.log(`${DBG_PREFIX} [sig] peer-disconnected room:${roomId} peer:${socket.id}`);
        await roomService.unbindSocketFromRoom(socket.id, roomId);
        if (await roomService.isRoomEmpty(roomId)) {
          // await deleteRoom(roomId);
          await roomService.refreshRoom(roomId, 900);
          if (roomId === DEBUG_ROOM_ID)
            console.log(
              `${DBG_PREFIX} Room ${roomId} is empty and will be deleted in 15 min due to disconnect.`
            );
        }
      }
    });
  });
}
