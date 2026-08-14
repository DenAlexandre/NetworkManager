import { apiFetch } from "./client";

export interface Equipment {
  id: number;
  name: string;
  roomId: number;
  roomName: string;
  zoneId: number;
  zoneName: string;
  siteId: number;
  siteName: string;
  deviceTypeId: number;
  deviceType: string;
  hardwareModelId: number;
  hardwareModel: string;
  brandName: string;
}

export interface EquipmentInput {
  roomId: number;
  deviceTypeId: number;
  hardwareModelId: number;
  name: string;
}

export function listEquipment(roomId?: number) {
  const query = roomId ? `?roomId=${roomId}` : "";
  return apiFetch<{ equipment: Equipment[] }>(`/equipment${query}`);
}

export function getEquipment(id: number) {
  return apiFetch<{ equipment: Equipment }>(`/equipment/${id}`);
}

export function createEquipment(input: EquipmentInput) {
  return apiFetch<{ equipment: Equipment }>("/equipment", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEquipment(id: number, input: EquipmentInput) {
  return apiFetch<{ equipment: Equipment }>(`/equipment/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEquipment(id: number) {
  return apiFetch<void>(`/equipment/${id}`, { method: "DELETE" });
}
