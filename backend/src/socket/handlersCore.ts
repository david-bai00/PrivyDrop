export interface JoinDataLike {
  roomId: string;
}

export interface SignalingDataLike {
  peerId: string;
  from?: string;
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
}

export interface InitiatorDataLike {
  roomId: string;
}

export interface RecipientDataLike {
  roomId: string;
  peerId: string;
}

export interface SocketLike {
  id: string;
  handshake: {
    headers: Record<string, string | string[] | undefined>;
    address: string;
  };
  on(event: string, handler: (...args: any[]) => void | Promise<void>): SocketLike;
  emit(event: string, payload: unknown): boolean;
  join(roomId: string): void;
  to(roomId: string): {
    emit(event: string, payload: unknown): boolean;
  };
}

export interface IoLike {
  on(event: "connection", handler: (socket: SocketLike) => void): IoLike;
}

export interface SocketHandlerDependencies {
  getRoomBySocketId(socketId: string): Promise<string | null>;
  isRoomExist(roomId: string): Promise<boolean>;
  bindSocketToRoom(socketId: string, roomId: string): Promise<void>;
  refreshRoom(roomId: string, expiry?: number): Promise<void>;
  unbindSocketFromRoom(socketId: string, roomId: string): Promise<void>;
  isRoomEmpty(roomId: string): Promise<boolean>;
  checkRateLimit(ip: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAfter: number;
  }>;
  disableJoinRateLimit: boolean;
}

export function setupSocketHandlers(
  io: IoLike,
  dependencies: SocketHandlerDependencies
): void {
  io.on("connection", (socket: SocketLike) => {
    console.log("New client connected:", socket.id);

    socket.on("join", async (data: JoinDataLike) => {
      const { roomId: targetRoomId } = data;
      try {
        const existingRoomId = await dependencies.getRoomBySocketId(socket.id);
        const isRejoinForSameRoom =
          existingRoomId !== null && existingRoomId === targetRoomId;

        if (existingRoomId && existingRoomId !== targetRoomId) {
          socket.emit("joinResponse", {
            success: false,
            message: "Socket is already bound to another room",
            roomId: targetRoomId,
          });
          return;
        }

        const forwardedFor = socket.handshake.headers["x-forwarded-for"];
        const clientIp = Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : forwardedFor || socket.handshake.address;

        if (!isRejoinForSameRoom && !dependencies.disableJoinRateLimit) {
          const rateLimitCheck = await dependencies.checkRateLimit(clientIp);
          if (!rateLimitCheck.allowed) {
            socket.emit("joinResponse", {
              success: false,
              message: `Rate limit exceeded. Try again in ${rateLimitCheck.resetAfter}s. Attempts left: ${rateLimitCheck.remaining}.`,
              roomId: targetRoomId,
            });
            return;
          }
        }

        const targetRoomExists = await dependencies.isRoomExist(targetRoomId);
        if (!targetRoomExists) {
          socket.emit("joinResponse", {
            success: false,
            message: "Room does not exist",
            roomId: targetRoomId,
          });
          return;
        }

        if (!existingRoomId) {
          socket.join(targetRoomId);
          console.log(`Client ${socket.id} joined room ${targetRoomId}`);
          await dependencies.bindSocketToRoom(socket.id, targetRoomId);
        }

        await dependencies.refreshRoom(targetRoomId);
        socket.emit("joinResponse", {
          success: true,
          message: "Successfully joined room",
          roomId: targetRoomId,
        });
        socket.to(targetRoomId).emit("ready", { peerId: socket.id });
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("joinResponse", {
          success: false,
          message: "Server error while joining room",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    socket.on("offer", (data: SignalingDataLike) => {
      socket.to(data.peerId).emit("offer", {
        offer: data.offer,
        from: data.from,
        peerId: socket.id,
      });
    });

    socket.on("answer", (data: SignalingDataLike) => {
      socket.to(data.peerId).emit("answer", {
        answer: data.answer,
        from: data.from,
        peerId: socket.id,
      });
    });

    socket.on("ice-candidate", (data: SignalingDataLike) => {
      socket.to(data.peerId).emit("ice-candidate", {
        candidate: data.candidate,
        from: data.from,
        peerId: socket.id,
      });
    });

    socket.on("initiator-online", (data: InitiatorDataLike) => {
      socket.to(data.roomId).emit("initiator-online", {
        roomId: data.roomId,
      });
    });

    socket.on("recipient-ready", (data: RecipientDataLike) => {
      socket.to(data.roomId).emit("recipient-ready", {
        peerId: data.peerId,
      });
    });

    socket.on("disconnect", async () => {
      console.log("Disconnected:", socket.id);
      const roomId = await dependencies.getRoomBySocketId(socket.id);
      if (roomId) {
        socket.to(roomId).emit("peer-disconnected", { peerId: socket.id });
        await dependencies.unbindSocketFromRoom(socket.id, roomId);
        if (await dependencies.isRoomEmpty(roomId)) {
          await dependencies.refreshRoom(roomId, 900);
          console.log(
            `Room ${roomId} is empty and will be deleted in 15 min due to disconnect.`
          );
        }
      }
    });
  });
}
