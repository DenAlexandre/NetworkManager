import { apiFetch } from "./client";

export interface Api {
  id: number;
  name: string;
  migrationDate: string | null;
  completed: boolean;
  doeUpToDate: boolean;
}

export interface ApiInput {
  name: string;
  migrationDate: string | null;
  completed: boolean;
  doeUpToDate: boolean;
}

export function listApis() {
  return apiFetch<{ apis: Api[] }>("/apis");
}

export function getApi(id: number) {
  return apiFetch<{ api: Api }>(`/apis/${id}`);
}

export function createApi(input: ApiInput) {
  return apiFetch<{ api: Api }>("/apis", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateApi(id: number, input: ApiInput) {
  return apiFetch<{ api: Api }>(`/apis/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteApi(id: number) {
  return apiFetch<void>(`/apis/${id}`, { method: "DELETE" });
}
