import { useRef, useState } from "react";
import { listApis } from "../../api/apis";
import { listEquipment, createEquipment } from "../../api/equipment";
import { listHardwareModels } from "../../api/hardwareModels";
import { listRooms } from "../../api/rooms";
import { ApiError } from "../../api/client";

const CSV_COLUMNS = ["Nom", "Type", "Constructeur", "Modèle", "Salle", "API"];

interface ImportRowResult {
  line: number;
  name: string;
  status: "success" | "error";
  message: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function toCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function ImportExportPage() {
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
      const { equipment } = await listEquipment();
      const lines = [CSV_COLUMNS.join(",")];
      for (const item of equipment) {
        const room = `${item.siteName} / ${item.zoneName} / ${item.roomName}`;
        lines.push(
          [item.name, item.deviceType, item.brandName, item.hardwareModel, room, item.apiName ?? ""]
            .map(toCsvField)
            .join(",")
        );
      }
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `materiel-${new Date().toISOString().slice(0, 10)}.csv`;
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

      const [{ hardwareModels }, { rooms }, { apis }] = await Promise.all([
        listHardwareModels(),
        listRooms(),
        listApis(),
      ]);

      const results: ImportRowResult[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const line = i + 2; // +1 for 0-index, +1 for the header row
        const [name = "", , constructeur = "", modele = "", salle = "", apiValue = ""] = dataRows[i];
        const trimmedName = name.trim();

        if (!trimmedName) {
          results.push({ line, name: trimmedName, status: "error", message: "Nom manquant." });
          continue;
        }

        const hardwareModel = hardwareModels.find(
          (hm) =>
            hm.brandName.trim().toLowerCase() === constructeur.trim().toLowerCase() &&
            hm.name.trim().toLowerCase() === modele.trim().toLowerCase()
        );
        if (!hardwareModel) {
          results.push({
            line,
            name: trimmedName,
            status: "error",
            message: `Matériel introuvable : "${constructeur} — ${modele}".`,
          });
          continue;
        }

        const room = rooms.find(
          (r) => `${r.siteName} / ${r.zoneName} / ${r.name}`.trim().toLowerCase() === salle.trim().toLowerCase()
        );
        if (!room) {
          results.push({ line, name: trimmedName, status: "error", message: `Salle introuvable : "${salle}".` });
          continue;
        }

        let apiId: number | null = null;
        if (apiValue.trim()) {
          const api = apis.find((a) => a.name.trim().toLowerCase() === apiValue.trim().toLowerCase());
          if (!api) {
            results.push({ line, name: trimmedName, status: "error", message: `API introuvable : "${apiValue}".` });
            continue;
          }
          apiId = api.id;
        }

        try {
          await createEquipment({
            roomId: room.id,
            deviceTypeId: hardwareModel.deviceTypeId,
            hardwareModelId: hardwareModel.id,
            apiId,
            name: trimmedName,
          });
          results.push({ line, name: trimmedName, status: "success", message: "Créé." });
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
    <div className="card">
      <div className="page-header">
        <h2>Import/Export</h2>
      </div>

      <div className="card card-compact-top">
        <h2>Export</h2>
        <p className="muted">Télécharge la liste complète du matériel au format CSV (compatible Excel).</p>
        <button type="button" className="btn" onClick={handleExport} disabled={exporting}>
          {exporting ? "Préparation..." : "Exporter le matériel (CSV)"}
        </button>
        {exportError && <p className="error">{exportError}</p>}
      </div>

      <div className="card card-compact-top">
        <h2>Import</h2>
        <p className="muted">
          Colonnes attendues : {CSV_COLUMNS.join(", ")}. Le type de matériel, le constructeur et le modèle doivent
          correspondre exactement à des entrées existantes dans le catalogue, et la salle au format
          "Site / Zone / Salle". La colonne API est optionnelle. Le fichier exporté ci-dessus peut servir de modèle.
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
              {successCount} matériel(s) créé(s), {errorCount} erreur(s).
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
    </div>
  );
}
