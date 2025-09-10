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
  const iceServers: RTCIceServer[] = [];

  if (config.USE_HTTPS) {
    // Check if TURN server configuration is complete
    if (!config.TURN_HOST || !config.TURN_USERNAME || !config.TURN_CREDENTIAL) {
      console.warn(
        "TURN server configuration incomplete in HTTPS environment. " +
        "Please set NEXT_PUBLIC_TURN_HOST, NEXT_PUBLIC_TURN_USERNAME, and NEXT_PUBLIC_TURN_PASSWORD " +
        "environment variables for better connectivity. Falling back to Google STUN server."
      );
      
      // Fallback to Google STUN server
      iceServers.push({
        urls: "stun:stun.l.google.com:19302",
      });
    } else {
      // Add self-hosted STUN and TURN servers
      iceServers.push(
        {
          urls: `stun:${config.TURN_HOST}:3478`,
        },
        {
          urls: `turns:${config.TURN_HOST}:443`,
          username: config.TURN_USERNAME,
          credential: config.TURN_CREDENTIAL,
        },
        {
          urls: `turn:${config.TURN_HOST}:3478`,
          username: config.TURN_USERNAME,
          credential: config.TURN_CREDENTIAL,
        }
      );
    }
  } else {
    // Development environment uses Google's public STUN server
    iceServers.push({
      urls: "stun:stun.l.google.com:19302",
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
