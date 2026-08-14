import { apiFetch } from "./client";

export interface Site {
  id: number;
  name: string;
}

export interface SiteInput {
  name: string;
}

export function listSites() {
  return apiFetch<{ sites: Site[] }>("/sites");
}

export function getSite(id: number) {
  return apiFetch<{ site: Site }>(`/sites/${id}`);
}

export function createSite(input: SiteInput) {
  return apiFetch<{ site: Site }>("/sites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSite(id: number, input: SiteInput) {
  return apiFetch<{ site: Site }>(`/sites/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteSite(id: number) {
  return apiFetch<void>(`/sites/${id}`, { method: "DELETE" });
}
