import { config, getFetchOptions } from "./environment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const API_ROUTES = {
  get_room: `${API_URL}/api/get_room`,
  check_room: `${API_URL}/api/check_room`,
  create_room: `${API_URL}/api/create_room`,
  leave_room: `${API_URL}/api/leave_room`,
  set_track: `${API_URL}/api/set_track`,
  logs_debug: `${API_URL}/api/logs_debug`,
};
// Unified API call handler
async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      // If the server returns a non-2xx status code, throw an error
      const errorData = await response.text(); // Attempt to get the error text
      throw new Error(
        `API call failed with status ${response.status}: ${errorData}`
      );
    }

    // Some responses may not have a body (e.g., 204 No Content), which needs special handling
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`Error in apiCall for URL: ${url}`, error);
    return null; // Return null on any error, so the caller can handle it gracefully
  }
}

// Get a random available room ID
export const fetchRoom = async (): Promise<string | null> => {
  const data = await apiCall<{ roomId: string }>(
    API_ROUTES.get_room,
    getFetchOptions()
  );
  return data?.roomId ?? null;
};

// Create a room with a specified ID
export const createRoom = async (roomId: string): Promise<boolean> => {
  const options = getFetchOptions({
    method: "POST",
    body: JSON.stringify({ roomId }),
  });
  const data = await apiCall<{ success: boolean }>(
    API_ROUTES.create_room,
    options
  );
  return data?.success ?? false;
};

// Check if a room is available
export const checkRoom = async (roomId: string): Promise<boolean> => {
  const options = getFetchOptions({
    method: "POST",
    body: JSON.stringify({ roomId }),
  });
  const data = await apiCall<{ available: boolean }>(
    API_ROUTES.check_room,
    options
  );
  return data?.available ?? false;
};

// Set tracking information
export const setTrack = async (ref: string) => {
  const options = getFetchOptions({
    method: "POST",
    body: JSON.stringify({ ref, timestamp: new Date().toISOString() }),
  });
  return apiCall<void>(API_ROUTES.set_track, options);
};

// Log debug messages
export const postLogInDebug = async (message: string) => {
  const options = getFetchOptions({
    method: "POST",
    body: JSON.stringify({
      message,
      timestamp: new Date().toISOString(),
    }),
  });
  return apiCall<void>(API_ROUTES.logs_debug, options);
};

// Leave a room
export const leaveRoom = async (
  roomId: string,
  socketId: string
): Promise<boolean> => {
  const options = getFetchOptions({
    method: "POST",
    body: JSON.stringify({ roomId, socketId }),
  });
  const data = await apiCall<{ success: boolean }>(
    API_ROUTES.leave_room,
    options
  );
  return data?.success ?? false;
};
