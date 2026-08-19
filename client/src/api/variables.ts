import { apiFetch } from "./client";

export interface Variable {
  id: number;
  hardwareModelId: number;
  name: string;
  unit: string;
  register: string;
  hardwareModelName: string;
  brandName: string;
}

export interface VariableInput {
  hardwareModelId: number;
  name: string;
  unit: string;
  register: string;
}

export function listVariables() {
  return apiFetch<{ variables: Variable[] }>("/variables");
}

export function getVariable(id: number) {
  return apiFetch<{ variable: Variable }>(`/variables/${id}`);
}

export function createVariable(input: VariableInput) {
  return apiFetch<{ variable: Variable }>("/variables", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateVariable(id: number, input: VariableInput) {
  return apiFetch<{ variable: Variable }>(`/variables/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteVariable(id: number) {
  return apiFetch<void>(`/variables/${id}`, { method: "DELETE" });
}
