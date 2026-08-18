import { apiDownload, apiFetch } from "./client";

export async function downloadDatabaseBackup() {
  const { blob, filename } = await apiDownload("/system/database/backup");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function restoreDatabase(payload: unknown) {
  return apiFetch<{ success: boolean }>("/system/database/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetDatabaseKeepDataTypes() {
  return apiFetch<{ success: boolean }>("/system/database/reset", { method: "POST" });
}
