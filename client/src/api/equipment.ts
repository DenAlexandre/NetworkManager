import { apiFetch } from "./client";

export interface Equipment {
  id: number;
  name: string;
  manufacturerId: number;
  manufacturerName: string;
  deviceType: string;
}

export interface EquipmentInput {
  name: string;
  manufacturerId: number;
}

export function listEquipment() {
  return apiFetch<{ equipment: Equipment[] }>("/equipment");
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
