import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { listEquipmentVariableSettings, saveEquipmentVariableSetting } from "../../api/equipmentVariableSettings";
import { ApiError } from "../../api/client";
import { parseCsv } from "../../utils/csv";
import type { ImportRowResult } from "../../utils/csv";

const VARIABLES_SHEET = "Variables";
const VARIABLES_COLUMNS = ["Matériel", "Salle", "Matériel lié", "Variable", "Mnémonique", "Description"];

function roomLabel(item: { siteName: string; zoneName: string; roomName: string }) {
  return `${item.siteName} / ${item.zoneName} / ${item.roomName}`;
}

async function readRowsFromFile(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[VARIABLES_SHEET] ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    return rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
  }
  const text = await file.text();
  return parseCsv(text);
}

export function VariablesImportExport() {
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
      const { equipment } = await listEquipmentVariableSettings();
      const rows = equipment.flatMap((item) =>
        item.variables.map((variable) => [
          item.equipmentName,
          roomLabel(item),
          item.linkedEquipmentName ?? "",
          variable.name,
          variable.mnemonic,
          variable.description,
        ])
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([VARIABLES_COLUMNS, ...rows]),
        VARIABLES_SHEET
      );
      XLSX.writeFile(workbook, `variables-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      const rows = await readRowsFromFile(importFile);
      if (rows.length === 0) {
        throw new Error("Le fichier est vide.");
      }
      const [, ...dataRows] = rows;

      const { equipment } = await listEquipmentVariableSettings();

      const results: ImportRowResult[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const line = i + 2; // +1 for 0-index, +1 for the header row
        const [materielName = "", salle = "", , variableName = "", mnemonic = "", description = ""] = dataRows[i];
        const trimmedMateriel = materielName.trim();
        const trimmedVariable = variableName.trim();
        const label = `${trimmedMateriel} / ${trimmedVariable}`;

        if (!trimmedMateriel || !trimmedVariable) {
          results.push({ line, name: label, status: "error", message: "Matériel ou variable manquant." });
          continue;
        }

        const item = equipment.find(
          (e) =>
            e.equipmentName.trim().toLowerCase() === trimmedMateriel.toLowerCase() &&
            roomLabel(e).trim().toLowerCase() === salle.trim().toLowerCase()
        );
        if (!item) {
          results.push({
            line,
            name: label,
            status: "error",
            message: `Matériel introuvable : "${trimmedMateriel}" (${salle}).`,
          });
          continue;
        }

        const variable = item.variables.find((v) => v.name.trim().toLowerCase() === trimmedVariable.toLowerCase());
        if (!variable) {
          results.push({
            line,
            name: label,
            status: "error",
            message: `Variable introuvable : "${trimmedVariable}" pour "${trimmedMateriel}".`,
          });
          continue;
        }

        try {
          await saveEquipmentVariableSetting({
            equipmentId: item.equipmentId,
            hardwareModelVariableId: variable.hardwareModelVariableId,
            mnemonic: mnemonic.trim(),
            description: description.trim(),
          });
          results.push({ line, name: label, status: "success", message: "Mis à jour." });
        } catch (err) {
          results.push({
            line,
            name: label,
            status: "error",
            message: err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.",
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
      <h2>Gestion des variables</h2>

      <h3>Export</h3>
      <p className="muted">
        Télécharge un fichier Excel (.xlsx) avec le mnémonique et la description de chaque variable de supervision de
        tout le matériel.
      </p>
      <button type="button" className="btn" onClick={handleExport} disabled={exporting}>
        {exporting ? "Préparation..." : "Exporter les variables (Excel)"}
      </button>
      {exportError && <p className="error">{exportError}</p>}

      <h3>Import</h3>
      <p className="muted">
        Réimportez le fichier Excel téléchargé ci-dessus (ou un .csv équivalent) pour mettre à jour les mnémoniques
        et descriptions en masse. Colonnes attendues : {VARIABLES_COLUMNS.join(", ")}. Le matériel est identifié par
        son nom et sa salle (format "Site / Zone / Salle"), la variable par son nom — les colonnes "Matériel",
        "Salle" et "Variable" ne doivent donc pas être modifiées. Seuls le mnémonique et la description sont mis à
        jour ; les lignes dont le matériel ou la variable est introuvable sont signalées en erreur sans bloquer le
        reste de l'import.
      </p>
      <div className="inline-form">
        <label>
          Fichier Excel ou CSV
          <input
            type="file"
            accept=".xlsx,.csv,text/csv"
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
            {successCount} variable(s) mise(s) à jour, {errorCount} erreur(s).
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Matériel / Variable</th>
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
