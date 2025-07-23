export const config = {
  API_URL: process.env.NEXT_PUBLIC_API_URL!,
  USE_HTTPS: process.env.NODE_ENV !== "development",
  USE_CREDENTIALS: process.env.NODE_ENV !== "development",

  // Optional: Self-hosted TURN server settings
  // To enable, set NEXT_PUBLIC_TURN_HOST, NEXT_PUBLIC_TURN_USERNAME, and NEXT_PUBLIC_TURN_PASSWORD in your .env file
  TURN_HOST: process.env.NEXT_PUBLIC_TURN_HOST,
  TURN_USERNAME: process.env.NEXT_PUBLIC_TURN_USERNAME,
  TURN_CREDENTIAL: process.env.NEXT_PUBLIC_TURN_PASSWORD,
};

export const getIceServers = () => {
  // Default public STUN server
  const iceServers: RTCIceServer[] = [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ];

  // Add self-hosted TURN/STUN server if configured through environment variables
  if (config.TURN_HOST && config.TURN_USERNAME && config.TURN_CREDENTIAL) {
    const turnUrls = config.USE_HTTPS
      ? [`turns:${config.TURN_HOST}:443`, `turn:${config.TURN_HOST}:3478`]
      : [`turn:${config.TURN_HOST}:3478`];

    // Add STUN from the self-hosted server
    iceServers.push({
      urls: `stun:${config.TURN_HOST}:3478`,
    });

    // Add TURN from the self-hosted server
    iceServers.push({
      urls: turnUrls,
      username: config.TURN_USERNAME,
      credential: config.TURN_CREDENTIAL,
    });
  }

  return iceServers;
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
