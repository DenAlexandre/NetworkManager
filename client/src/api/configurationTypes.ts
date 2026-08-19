import { apiFetch } from "./client";

export interface ConfigurationType {
  id: number;
  name: string;
  configuration: string;
}

export interface ConfigurationTypeInput {
  name: string;
  configuration: string;
}

export function listConfigurationTypes() {
  return apiFetch<{ configurationTypes: ConfigurationType[] }>("/configuration-types");
}

export function getConfigurationType(id: number) {
  return apiFetch<{ configurationType: ConfigurationType }>(`/configuration-types/${id}`);
}

export function createConfigurationType(input: ConfigurationTypeInput) {
  return apiFetch<{ configurationType: ConfigurationType }>("/configuration-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateConfigurationType(id: number, input: ConfigurationTypeInput) {
  return apiFetch<{ configurationType: ConfigurationType }>(`/configuration-types/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteConfigurationType(id: number) {
  return apiFetch<void>(`/configuration-types/${id}`, { method: "DELETE" });
}
