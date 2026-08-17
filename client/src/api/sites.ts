import { API_ORIGIN, apiFetch, apiUpload } from "./client";

export interface Site {
  id: number;
  name: string;
  datasheetPath: string | null;
}

export interface SiteInput {
  name: string;
}

export function siteDatasheetUrl(datasheetPath: string) {
  return `${API_ORIGIN}/uploads/site-datasheets/${datasheetPath}`;
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

export function uploadSiteDatasheet(id: number, file: File) {
  const formData = new FormData();
  formData.append("datasheet", file);
  return apiUpload<{ site: Site }>(`/sites/${id}/datasheet`, formData);
}

export function deleteSiteDatasheet(id: number) {
  return apiFetch<{ site: Site }>(`/sites/${id}/datasheet`, { method: "DELETE" });
}
