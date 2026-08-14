import { apiFetch } from "./client";

export interface Manufacturer {
  id: number;
  deviceTypeId: number;
  deviceType: string;
  brandId: number;
  manufacturer: string;
  hardwareModelId: number | null;
  reference: string | null;
  docPath: string | null;
  ioType: string | null;
}

export interface ManufacturerInput {
  deviceTypeId: number;
  brandId: number;
  hardwareModelId?: number | null;
  docPath?: string | null;
  ioType?: string | null;
}

export function listManufacturers() {
  return apiFetch<{ manufacturers: Manufacturer[] }>("/manufacturers");
}

export function getManufacturer(id: number) {
  return apiFetch<{ manufacturer: Manufacturer }>(`/manufacturers/${id}`);
}

export function createManufacturer(input: ManufacturerInput) {
  return apiFetch<{ manufacturer: Manufacturer }>("/manufacturers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateManufacturer(id: number, input: ManufacturerInput) {
  return apiFetch<{ manufacturer: Manufacturer }>(`/manufacturers/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteManufacturer(id: number) {
  return apiFetch<void>(`/manufacturers/${id}`, { method: "DELETE" });
}
