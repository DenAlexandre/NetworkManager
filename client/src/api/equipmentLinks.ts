import { apiFetch } from "./client";

export interface EquipmentLink {
  id: number;
  parentEquipmentId: number;
  parentEquipmentName: string;
  parentPortId: number;
  parentPortLabel: string;
  childEquipmentId: number;
  childEquipmentName: string;
  childPortId: number;
  childPortLabel: string;
}

export interface EquipmentLinkInput {
  parentEquipmentId: number;
  parentPortId: number;
  childEquipmentId: number;
  childPortId: number;
}

export function listEquipmentLinks(equipmentId?: number) {
  const query = equipmentId ? `?equipmentId=${equipmentId}` : "";
  return apiFetch<{ links: EquipmentLink[] }>(`/equipment-links${query}`);
}

export function getEquipmentLink(id: number) {
  return apiFetch<{ link: EquipmentLink }>(`/equipment-links/${id}`);
}

export function createEquipmentLink(input: EquipmentLinkInput) {
  return apiFetch<{ link: EquipmentLink }>("/equipment-links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEquipmentLink(id: number, input: EquipmentLinkInput) {
  return apiFetch<{ link: EquipmentLink }>(`/equipment-links/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEquipmentLink(id: number) {
  return apiFetch<void>(`/equipment-links/${id}`, { method: "DELETE" });
}
