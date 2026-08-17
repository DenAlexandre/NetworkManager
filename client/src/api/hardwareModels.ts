import { API_ORIGIN, apiFetch, apiUpload } from "./client";

export interface HardwareModel {
  id: number;
  brandId: number;
  brandName: string;
  deviceTypeId: number;
  deviceType: string;
  name: string;
  imagePath: string | null;
}

export function hardwareModelImageUrl(imagePath: string) {
  return `${API_ORIGIN}/uploads/hardware-models/${imagePath}`;
}

export interface HardwareModelInput {
  brandId: number;
  deviceTypeId: number;
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

export function uploadHardwareModelImage(id: number, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  return apiUpload<{ hardwareModel: HardwareModel }>(`/hardware-models/${id}/image`, formData);
}

export function deleteHardwareModelImage(id: number) {
  return apiFetch<{ hardwareModel: HardwareModel }>(`/hardware-models/${id}/image`, { method: "DELETE" });
}
