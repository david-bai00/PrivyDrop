import { config, getFetchOptions } from './environment';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const API_ROUTES = {
  get_room: `${API_URL}/api/get_room`,
  check_room: `${API_URL}/api/check_room`,
  creat_room: `${API_URL}/api/creat_room`,
  set_track: `${API_URL}/api/set_track`,
  logs_debug: `${API_URL}/api/logs_debug`,
};
// 创建房间
export const postLogInDebug = async (message: string) => {
  try {
    
    const response = await fetch(
      `${API_ROUTES.logs_debug}`,
      getFetchOptions({
        method: 'POST',
        body: JSON.stringify({ 
          message,
          timestamp: new Date().toISOString()
         }),
      })
    );
  } catch (error) {
    console.error('Error creating room:', error);
  }
};
export const fetchRoom = async () => {
  try {
    const response = await fetch(
      `${API_ROUTES.get_room}`, 
      getFetchOptions()
    );
    const data = await response.json();
    return data.roomId;
  } catch (err) {
    console.error('Error fetching room:', err);
    throw err;
  }
};
// 创建房间
export const createRoom = async (roomId: string) => {
  try {
    const response = await fetch(
      `${API_ROUTES.creat_room}`,
      getFetchOptions({
        method: 'POST',
        body: JSON.stringify({ roomId }),
      })
    );
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error creating room:', error);
    return false;
  }
};
// 检查房间是否可用
export const checkRoom = async (roomId: string) => {
  try {
    const response = await fetch(
      `${API_ROUTES.check_room}`,
      getFetchOptions({
        method: 'POST',
        body: JSON.stringify({ roomId }),
      })
    );
    const data = await response.json();
    return data.available;
  } catch (error) {
    console.error('Error checking room:', error);
    return false;
  }
};
// 设置追踪信息
export const setTrack = async (ref: string,path: string) => {
  try {
    const response = await fetch(
      `${API_ROUTES.set_track}`,
      getFetchOptions({
        method: 'POST',
        body: JSON.stringify({ ref,path,timestamp: new Date().toISOString() }),
      })
    );
    // const data = await response.json();
    // return data.success;
  } catch (error) {
    console.error('Error checking room:', error);
    // return false;
  }
};