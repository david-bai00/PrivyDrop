export interface RoomInfo {
    created_at: number;
}
  
export interface ReferrerTrack {
    ref: string;
    timestamp: number;
    path: string;
}

export interface LogMessage {
    message: string;
    timestamp: number;
}