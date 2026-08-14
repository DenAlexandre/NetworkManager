import { apiFetch } from "./client";

export interface Brand {
  id: number;
  name: string;
}

export interface BrandInput {
  name: string;
}

export function listBrands() {
  return apiFetch<{ brands: Brand[] }>("/brands");
}

export function getBrand(id: number) {
  return apiFetch<{ brand: Brand }>(`/brands/${id}`);
}

export function createBrand(input: BrandInput) {
  return apiFetch<{ brand: Brand }>("/brands", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBrand(id: number, input: BrandInput) {
  return apiFetch<{ brand: Brand }>(`/brands/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteBrand(id: number) {
  return apiFetch<void>(`/brands/${id}`, { method: "DELETE" });
}
