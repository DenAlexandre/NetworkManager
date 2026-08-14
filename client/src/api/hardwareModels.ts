import { apiFetch } from "./client";

export interface HardwareModel {
  id: number;
  brandId: number;
  brandName: string;
  name: string;
}

export interface HardwareModelInput {
  brandId: number;
  name: string;
}

export function listHardwareModels() {
  return apiFetch<{ hardwareModels: HardwareModel[] }>("/hardware-models");
}

export function getHardwareModel(id: number) {
  return apiFetch<{ hardwareModel: HardwareModel }>(`/hardware-models/${id}`);
}

export function createHardwareModel(input: HardwareModelInput) {
  return apiFetch<{ hardwareModel: HardwareModel }>("/hardware-models", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateHardwareModel(id: number, input: HardwareModelInput) {
  return apiFetch<{ hardwareModel: HardwareModel }>(`/hardware-models/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteHardwareModel(id: number) {
  return apiFetch<void>(`/hardware-models/${id}`, { method: "DELETE" });
}
