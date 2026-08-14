import { apiFetch } from "./client";

export type RecipeStatus = "pending" | "approved" | "rejected";

export interface Recipe {
  id: number;
  title: string;
  description: string;
  ingredients: string;
  steps: string;
  status: RecipeStatus;
  created_at: string;
  reviewed_at: string | null;
  author_id: number;
  author_username?: string;
}

export interface RecipeInput {
  title: string;
  description: string;
  ingredients: string;
  steps: string;
}

export function fetchApprovedRecipes() {
  return apiFetch<{ recipes: Recipe[] }>("/recipes");
}

export function fetchRecipe(id: number | string) {
  return apiFetch<{ recipe: Recipe }>(`/recipes/${id}`);
}

export function fetchMyRecipes() {
  return apiFetch<{ recipes: Recipe[] }>("/recipes/mine");
}

export function createRecipe(input: RecipeInput) {
  return apiFetch<{ recipe: Recipe }>("/recipes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteRecipe(id: number) {
  return apiFetch<void>(`/recipes/${id}`, { method: "DELETE" });
}

export function fetchPendingRecipes() {
  return apiFetch<{ recipes: Recipe[] }>("/admin/recipes/pending");
}

export function approveRecipe(id: number) {
  return apiFetch<{ recipe: Recipe }>(`/admin/recipes/${id}/approve`, { method: "POST" });
}

export function rejectRecipe(id: number) {
  return apiFetch<{ recipe: Recipe }>(`/admin/recipes/${id}/reject`, { method: "POST" });
}
