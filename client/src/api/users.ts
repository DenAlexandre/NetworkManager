import { apiFetch } from "./client";

export interface ManagedUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: string;
  roleId: number;
  roleName: string;
  roleIsAdmin: boolean;
}

export interface CreateUserInput {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  roleId: number;
}

export interface UpdateUserInput {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleId: number;
  password?: string;
}

export function listUsers() {
  return apiFetch<{ users: ManagedUser[] }>("/users");
}

export function getUser(id: number) {
  return apiFetch<{ user: ManagedUser }>(`/users/${id}`);
}

export function createUser(input: CreateUserInput) {
  return apiFetch<{ user: ManagedUser }>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateUser(id: number, input: UpdateUserInput) {
  return apiFetch<{ user: ManagedUser }>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteUser(id: number) {
  return apiFetch<void>(`/users/${id}`, { method: "DELETE" });
}
