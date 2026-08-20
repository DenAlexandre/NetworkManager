import { apiFetch } from "./client";
import type { AccessLevel, Section } from "../constants/permissions";

export interface Role {
  id: number;
  name: string;
  isSystem: boolean;
  isAdmin: boolean;
  userCount: number;
  permissions: Partial<Record<Section, AccessLevel>>;
}

export interface RolePermissionInput {
  section: Section;
  accessLevel: AccessLevel;
}

export interface RoleInput {
  name: string;
  permissions: RolePermissionInput[];
}

export function listRoles() {
  return apiFetch<{ roles: Role[] }>("/roles");
}

export function getRole(id: number) {
  return apiFetch<{ role: Role }>(`/roles/${id}`);
}

export function createRole(input: RoleInput) {
  return apiFetch<{ role: Role }>("/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRole(id: number, input: RoleInput) {
  return apiFetch<{ role: Role }>(`/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRole(id: number) {
  return apiFetch<void>(`/roles/${id}`, { method: "DELETE" });
}

export function replaceRole(id: number, replacementId: number) {
  return apiFetch<void>(`/roles/${id}/replace`, {
    method: "POST",
    body: JSON.stringify({ replacementId }),
  });
}
