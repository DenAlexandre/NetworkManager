import { apiFetch } from "./client";

export interface LinkType {
  id: number;
  name: string;
  color: string;
  strokeWidth: number;
  pointToPoint: boolean;
}

export interface LinkTypeInput {
  name: string;
  color: string;
  strokeWidth: number;
  pointToPoint: boolean;
}

export function listLinkTypes() {
  return apiFetch<{ linkTypes: LinkType[] }>("/link-types");
}

export function getLinkType(id: number) {
  return apiFetch<{ linkType: LinkType }>(`/link-types/${id}`);
}

export function createLinkType(input: LinkTypeInput) {
  return apiFetch<{ linkType: LinkType }>("/link-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateLinkType(id: number, input: LinkTypeInput) {
  return apiFetch<{ linkType: LinkType }>(`/link-types/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteLinkType(id: number) {
  return apiFetch<void>(`/link-types/${id}`, { method: "DELETE" });
}
