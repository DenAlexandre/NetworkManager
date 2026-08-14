import { apiFetch } from "./client";

export interface Room {
  id: number;
  zoneId: number;
  zoneName: string;
  siteId: number;
  siteName: string;
  name: string;
}

export interface RoomInput {
  zoneId: number;
  name: string;
}

export function listRooms(zoneId?: number) {
  const query = zoneId ? `?zoneId=${zoneId}` : "";
  return apiFetch<{ rooms: Room[] }>(`/rooms${query}`);
}

export function getRoom(id: number) {
  return apiFetch<{ room: Room }>(`/rooms/${id}`);
}

export function createRoom(input: RoomInput) {
  return apiFetch<{ room: Room }>("/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRoom(id: number, input: RoomInput) {
  return apiFetch<{ room: Room }>(`/rooms/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRoom(id: number) {
  return apiFetch<void>(`/rooms/${id}`, { method: "DELETE" });
}
