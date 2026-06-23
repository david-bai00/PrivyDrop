import { expect, type APIRequestContext } from "@playwright/test";
import { E2E_SERVER } from "./e2eConfig";

const SHORT_ROOM_ID_MIN = 1000;
const SHORT_ROOM_ID_COUNT = 9000;

export async function findAvailableShortRoomId(request: APIRequestContext) {
  const startOffset = Math.floor(Math.random() * SHORT_ROOM_ID_COUNT);

  for (let offset = 0; offset < SHORT_ROOM_ID_COUNT; offset += 1) {
    const roomId = String(
      SHORT_ROOM_ID_MIN + ((startOffset + offset) % SHORT_ROOM_ID_COUNT)
    );
    const response = await request.post(
      `${E2E_SERVER.backendUrl}/api/check_room`,
      {
        data: { roomId },
      }
    );

    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { available?: boolean };
    if (body.available) {
      return roomId;
    }
  }

  throw new Error("Could not find an available short room ID");
}
