import { useRef, useState } from "react";
import { listApis, createApi } from "../../api/apis";
import { ApiError } from "../../api/client";
import { parseCsv, toCsvField } from "../../utils/csv";
import type { ImportRowResult } from "../../utils/csv";

const CSV_COLUMNS = ["Nom", "Date de migration", "Terminé", "DOE à jour"];

function formatBoolean(value: boolean) {
  return value ? "Oui" : "Non";
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "oui" || normalized === "vrai" || normalized === "true" || normalized === "1";
}

export function ApisImportExport() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const { apis } = await listApis();
      const lines = [CSV_COLUMNS.join(",")];
      for (const api of apis) {
        lines.push(
          [api.name, api.migrationDate ? api.migrationDate.slice(0, 10) : "", formatBoolean(api.completed), formatBoolean(api.doeUpToDate)]
            .map(toCsvField)
            .join(",")
        );
      }
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `apis-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Erreur lors de l'export.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setImportError(null);
    setImportResults(null);
    setImporting(true);
    try {
      const text = await importFile.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        throw new Error("Le fichier est vide.");
      }
      const [, ...dataRows] = rows;

      const results: ImportRowResult[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const line = i + 2; // +1 for 0-index, +1 for the header row
        const [name = "", migrationDate = "", completedValue = "", doeUpToDateValue = ""] = dataRows[i];
        const trimmedName = name.trim();

        if (!trimmedName) {
          results.push({ line, name: trimmedName, status: "error", message: "Nom manquant." });
          continue;
        }

        try {
          await createApi({
            name: trimmedName,
            migrationDate: migrationDate.trim() || null,
            completed: parseBoolean(completedValue),
            doeUpToDate: parseBoolean(doeUpToDateValue),
          });
          results.push({ line, name: trimmedName, status: "success", message: "Créée." });
        } catch (err) {
          results.push({
            line,
            name: trimmedName,
            status: "error",
            message: err instanceof ApiError ? err.message : "Erreur lors de la création.",
          });
        }
      }
      setImportResults(results);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  }

  const successCount = importResults?.filter((r) => r.status === "success").length ?? 0;
  const errorCount = importResults?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="card card-compact-top">
      <h2>Gestion des API</h2>

      <h3>Export</h3>
      <p className="muted">Télécharge la liste complète des API au format CSV (compatible Excel).</p>
      <button type="button" className="btn" onClick={handleExport} disabled={exporting}>
        {exporting ? "Préparation..." : "Exporter les API (CSV)"}
      </button>
      {exportError && <p className="error">{exportError}</p>}

      <h3>Import</h3>
      <p className="muted">
        Colonnes attendues : {CSV_COLUMNS.join(", ")}. La date de migration est au format AAAA-MM-JJ (laisser vide si
        aucune). Les colonnes "Terminé" et "DOE à jour" acceptent "Oui"/"Non" (tout le reste est considéré comme
        "Non"). Le fichier exporté ci-dessus peut servir de modèle. Chaque ligne crée une nouvelle API, même si une
        API du même nom existe déjà.
      </p>
      <div className="inline-form">
        <label>
          Fichier CSV
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            onChange={(e) => setImportFile(e.currentTarget.files?.[0] ?? null)}
            disabled={importing}
          />
        </label>
        <button type="button" className="btn" onClick={handleImport} disabled={!importFile || importing}>
          {importing ? "Import en cours..." : "Importer"}
        </button>
      </div>
      {importError && <p className="error">{importError}</p>}

      {importResults && (
        <>
          <p className="muted">
            {successCount} API(s) créée(s), {errorCount} erreur(s).
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Nom</th>
                <th>Statut</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {importResults.map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td>
                  <td>{r.name || "—"}</td>
                  <td>{r.status === "success" ? "OK" : "Erreur"}</td>
                  <td className={r.status === "error" ? "error" : undefined}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
