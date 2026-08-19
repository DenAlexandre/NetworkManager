import { apiFetch } from "./client";

export interface ReportConfig {
  id: number;
  name: string;
  columnIds: string[];
  filters: Record<string, string[]>;
  sortColumnId: string | null;
  sortDir: "asc" | "desc";
  onlyLinked: boolean;
  updatedAt: string;
}

export interface ReportConfigInput {
  name: string;
  columnIds: string[];
  filters: Record<string, string[]>;
  sortColumnId: string | null;
  sortDir: "asc" | "desc";
  onlyLinked: boolean;
}

export function listReportConfigs() {
  return apiFetch<{ configs: ReportConfig[] }>("/report-configs");
}

export function createReportConfig(input: ReportConfigInput) {
  return apiFetch<{ config: ReportConfig }>("/report-configs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateReportConfig(id: number, input: ReportConfigInput) {
  return apiFetch<{ config: ReportConfig }>(`/report-configs/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteReportConfig(id: number) {
  return apiFetch<void>(`/report-configs/${id}`, { method: "DELETE" });
}
