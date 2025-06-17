export const config = {
  API_URL: process.env.NEXT_PUBLIC_API_URL!,
  SERVER_IP: process.env.NEXT_PUBLIC_SERVER_IP!,
  USE_HTTPS: process.env.NEXT_PUBLIC_USE_HTTPS === "true",
  USE_CREDENTIALS: process.env.NEXT_PUBLIC_USE_CREDENTIALS === "true",
  TURN_USERNAME: "secureUser",
  TURN_CREDENTIAL: "QWERTY!@#456",
};

export const getIceServers = () => {
  const stunUrl = [
    `stun:${config.SERVER_IP}:3478`,
    "stun:stun.l.google.com:19302",
  ];
  const turnUrls = config.USE_HTTPS
    ? [`turn:${config.SERVER_IP}:3478`, `turns:${config.SERVER_IP}:5349`]
    : [`turn:${config.SERVER_IP}:3478`];

  return [
    { urls: stunUrl },
    {
      urls: turnUrls,
      username: config.TURN_USERNAME,
      credential: config.TURN_CREDENTIAL,
    },
  ];
};

export const getSocketOptions = () => {
  return config.USE_HTTPS
    ? {
        secure: true,
        path: "/socket.io/",
        transports: ["websocket"],
      }
    : undefined;
};

export const getFetchOptions = (options: RequestInit = {}): RequestInit => {
  const defaultOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  };

  if (config.USE_CREDENTIALS) {
    defaultOptions.credentials = "include";
  }

  return defaultOptions;
};
