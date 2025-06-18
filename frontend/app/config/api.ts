import { config, getFetchOptions } from "./environment";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const API_ROUTES = {
  get_room: `${API_URL}/api/get_room`,
  check_room: `${API_URL}/api/check_room`,
  create_room: `${API_URL}/api/create_room`,
  set_track: `${API_URL}/api/set_track`,
  logs_debug: `${API_URL}/api/logs_debug`,
};
// 统一的 API 调用处理器
async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      // 如果服务器返回非 2xx 状态码, 抛出错误
      const errorData = await response.text(); // 尝试获取错误文本
      throw new Error(
        `API call failed with status ${response.status}: ${errorData}`
      );
    }

    // 某些响应可能没有内容体(例如 204 No Content), 需特殊处理
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`Error in apiCall for URL: ${url}`, error);
    return null; // 在发生任何错误时返回 null, 使调用方可以优雅地处理
  }
}

// 获取一个随机的可用房间ID
export const fetchRoom = async (): Promise<string | null> => {
  const data = await apiCall<{ roomId: string }>(
    API_ROUTES.get_room,
    getFetchOptions()
  );
  return data?.roomId ?? null;
};

// 创建指定ID的房间
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

// 检查房间是否可用
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

// 设置追踪信息
export const setTrack = async (ref: string, path: string) => {
  const options = getFetchOptions({
    method: "POST",
    body: JSON.stringify({ ref, path, timestamp: new Date().toISOString() }),
  });
  return apiCall<void>(API_ROUTES.set_track, options);
};

// 记录调试日志
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
