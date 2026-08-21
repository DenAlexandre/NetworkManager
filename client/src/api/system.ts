import { apiDownload, apiFetch, apiUpload } from "./client";

async function downloadBlob(path: string) {
  const { blob, filename } = await apiDownload(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadDatabaseBackup() {
  return downloadBlob("/system/database/backup");
}

export function restoreDatabase(payload: unknown) {
  return apiFetch<{ success: boolean }>("/system/database/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function downloadFilesBackup() {
  return downloadBlob("/system/database/backup-files");
}

export function restoreFilesBackup(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<{ success: boolean }>("/system/database/restore-files", formData);
}

export function resetDatabaseKeepDataTypes() {
  return apiFetch<{ success: boolean }>("/system/database/reset", { method: "POST" });
}
