import { apiFetch } from "./client";

export interface Port {
  id: number;
  hardwareModelId: number;
  linkTypeId: number;
  portType: string;
  label: string;
  hardwareModelName: string;
  manufacturerName: string;
}

export interface PortInput {
  hardwareModelId: number;
  linkTypeId: number;
  label: string;
}

export interface BulkPortInput {
  hardwareModelId: number;
  linkTypeId: number;
  quantity: number;
}

export function listPorts() {
  return apiFetch<{ ports: Port[] }>("/ports");
}

export function getPort(id: number) {
  return apiFetch<{ port: Port }>(`/ports/${id}`);
}

export function createPort(input: PortInput) {
  return apiFetch<{ port: Port }>("/ports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function bulkCreatePorts(input: BulkPortInput) {
  return apiFetch<{ ports: Port[] }>("/ports/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePort(id: number, input: PortInput) {
  return apiFetch<{ port: Port }>(`/ports/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePort(id: number) {
  return apiFetch<void>(`/ports/${id}`, { method: "DELETE" });
}
