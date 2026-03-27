export type RoomManagerText = {
  join: {
    inProgress: string;
    slow: string;
    duplicate: string;
    failure: string;
    success: string;
    notFound: string;
    timeout: string;
  };
  messages: {
    waiting: string;
    confirmLeave: string;
    leaveSuccess: string;
    fetchRoomError: string;
    generateShareLinkError: string;
    leaveRoomError: string;
    validateRoomError: string;
    resetSenderStateError: string;
  };
  roomCheck: {
    available: string;
    notAvailable: string;
  };
  status: {
    roomEmpty: string;
    receiverCanAccept: string;
    onlyOne: string;
    peopleCount: string;
    connected: string;
    leftRoom: string;
  };
};

export type FileTransferText = {
  fileExist: string;
  noFilesForFolder: string;
  zipError: string;
  fileNotFound: string;
};

export type ConnectionFeedbackText = {
  slow: string;
  negotiating: string;
  connected: string;
  restored: string;
  reconnecting: string;
};
