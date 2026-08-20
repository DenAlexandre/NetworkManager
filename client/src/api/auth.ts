import { apiFetch } from "./client";
import type { AccessLevel, Section } from "../constants/permissions";

export interface UserRole {
  id: number;
  name: string;
  isAdmin: boolean;
}

export interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  permissions: Partial<Record<Section, AccessLevel>>;
}

export interface RegisterInput {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

export function register(input: RegisterInput) {
  return apiFetch<{ user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(username: string, password: string) {
  return apiFetch<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function fetchMe() {
  return apiFetch<{ user: User }>("/auth/me");
}
