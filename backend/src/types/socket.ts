export interface JoinData {
  roomId: string;
}

// 添加 WebRTC 相关类型定义
declare global {
  interface RTCSessionDescriptionInit {
    type: RTCSdpType;
    sdp: string;
  }

  interface RTCIceCandidateInit {
    candidate: string;
    sdpMLineIndex?: number | null;
    sdpMid?: string | null;
    usernameFragment?: string | null;
  }

  type RTCSdpType = 'answer' | 'offer' | 'pranswer' | 'rollback';
}

export interface SignalingData {
  peerId: string;
  from?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface InitiatorData {
  roomId: string;
}

export interface RecipientData {
  roomId: string;
  peerId: string;
}