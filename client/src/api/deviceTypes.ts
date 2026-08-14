import { apiFetch } from "./client";

export interface DeviceType {
  id: number;
  name: string;
}

export interface DeviceTypeInput {
  name: string;
}

export function listDeviceTypes() {
  return apiFetch<{ deviceTypes: DeviceType[] }>("/device-types");
}

export function getDeviceType(id: number) {
  return apiFetch<{ deviceType: DeviceType }>(`/device-types/${id}`);
}

export function createDeviceType(input: DeviceTypeInput) {
  return apiFetch<{ deviceType: DeviceType }>("/device-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDeviceType(id: number, input: DeviceTypeInput) {
  return apiFetch<{ deviceType: DeviceType }>(`/device-types/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteDeviceType(id: number) {
  return apiFetch<void>(`/device-types/${id}`, { method: "DELETE" });
}
