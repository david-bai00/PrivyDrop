import { Server, Socket } from 'socket.io';
import * as roomService from '../services/room';
import { JoinData, SignalingData, InitiatorData, RecipientData } from '../types/socket';
import { checkRateLimit } from '../services/rateLimit';
// 房间管理：
// 使用 roomId 进行广播消息（socket.to(roomId).emit()）
// 场景：新用户加入通知、房间状态更新等
// WebRTC 信令：
// 使用 peerId 进行点对点通信（socket.to(peerId).emit()）
// 场景：offer、answer、ice-candidate 等 WebRTC 连接建立过程中的所有信令
export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', async (data: JoinData) => {
      const { roomId } = data;
      try {
        // 获取客户端IP
        const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                        socket.handshake.address;
        // 检查频率限制
        const rateLimitCheck = await checkRateLimit(clientIp as string);
        if (!rateLimitCheck.allowed) {
          socket.emit('joinResponse', {
            success: false,
            message: `Rate limit exceeded. Please try again in ${rateLimitCheck.resetAfter} seconds. ` +
                    `You have ${rateLimitCheck.remaining} attempts remaining.`,
            roomId: roomId
          });
          return;
        }
        const roomExist = await roomService.isRoomExist(roomId);
        console.log(`room ${roomId} roomExist:${roomExist}`);

        if (roomExist) {//房间存在
          const existingRoomId = await roomService.getRoomBySocketId(socket.id);
          if (!existingRoomId) {//socket.id不在房间里面 才允许新连接进入房间
            socket.join(roomId);
            console.log(`Client ${socket.id} joined room ${roomId}`);
            await roomService.bindSocketToRoom(socket.id, roomId);
          }
          
          await roomService.refreshRoom(roomId);
          // 通知用户加入成功
          socket.emit('joinResponse', {
            success: true,
            message: 'Successfully joined room',
            roomId: roomId
          });
          // 通知房间内所有其他用户有新成员加入
          socket.to(roomId).emit('ready', {
            peerId: socket.id
          });
        } else {
          console.log(`room ${roomId} roomExist:${roomExist},Room does not exist branch`);
          socket.emit('joinResponse', {
            success: false,
            message: 'Room does not exist',
            roomId: roomId
          });
        }
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('joinResponse', {
          success: false,
          message: 'Server error while joining room',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    // 处理WebRTC信令--直接转发
    // offer, answer, ice-candidate: 这些事件处理WebRTC连接的信令。它们负责转发客户端之间的连接请求和网络协商消息。
    // offer: 当一个客户端发起连接请求时，会发送一个offer给服务器，服务器将其转发给相同房间中的其他客户端。
    // answer: 被邀请的客户端接收到offer后，生成一个answer，通过服务器返回给发起连接的客户端。
    // ice-candidate: 当WebRTC需要穿透NAT防火墙时，会生成ICE候选者，客户端通过服务器相互交换这些信息，帮助建立P2P连接。
    socket.on('offer', (data: SignalingData) => {
      socket.to(data.peerId).emit('offer', {
        offer: data.offer,
        from: data.from,
        peerId: socket.id // 发送方的ID
      });
    });

    socket.on('answer', (data: SignalingData) => {
      socket.to(data.peerId).emit('answer', {
        answer: data.answer,
        from: data.from,
        peerId: socket.id
      });
    });

    socket.on('ice-candidate', (data: SignalingData) => {
      socket.to(data.peerId).emit('ice-candidate', {
        candidate: data.candidate,
        from: data.from,
        peerId: socket.id
      });
    });
    // 处理发起方重新上线的通知--广播给房间内的其他用户
    socket.on('initiator-online', (data: InitiatorData) => {
      socket.to(data.roomId).emit('initiator-online', {
        roomId: data.roomId
      });
    });
    // 处理接收方的响应
    socket.on('recipient-ready', (data: RecipientData) => {
      socket.to(data.roomId).emit('recipient-ready', {
        peerId: data.peerId
      });
    });

    socket.on('disconnect', async () => {
      console.log('Disconnected:', socket.id);
      const roomId = await roomService.getRoomBySocketId(socket.id);
      if (roomId) {
        await roomService.unbindSocketFromRoom(socket.id, roomId);
        if (await roomService.isRoomEmpty(roomId)) {
          // await deleteRoom(roomId);
          await roomService.refreshRoom(roomId, 3600);
          console.log(`Room ${roomId} is empty and will deleted in 1 hour`);
        }
      }
    });
  });
}
