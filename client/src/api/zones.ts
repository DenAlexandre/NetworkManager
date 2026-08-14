import { apiFetch } from "./client";

export interface Zone {
  id: number;
  siteId: number;
  siteName: string;
  name: string;
}

export interface ZoneInput {
  siteId: number;
  name: string;
}

export function listZones(siteId?: number) {
  const query = siteId ? `?siteId=${siteId}` : "";
  return apiFetch<{ zones: Zone[] }>(`/zones${query}`);
}

export function getZone(id: number) {
  return apiFetch<{ zone: Zone }>(`/zones/${id}`);
}

export function createZone(input: ZoneInput) {
  return apiFetch<{ zone: Zone }>("/zones", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateZone(id: number, input: ZoneInput) {
  return apiFetch<{ zone: Zone }>(`/zones/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteZone(id: number) {
  return apiFetch<void>(`/zones/${id}`, { method: "DELETE" });
}
