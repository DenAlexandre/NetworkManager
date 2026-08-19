import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { listApis } from "../../api/apis";
import { listEquipment, createEquipment, updateEquipment } from "../../api/equipment";
import { listEquipmentLinks } from "../../api/equipmentLinks";
import { listAddressing } from "../../api/equipmentPortSettings";
import { listHardwareModels } from "../../api/hardwareModels";
import { listRooms } from "../../api/rooms";
import { ApiError } from "../../api/client";
import { parseCsv } from "../../utils/csv";
import type { ImportRowResult } from "../../utils/csv";

const MATERIEL_SHEET = "Matériel";
const LIAISONS_SHEET = "Liaisons";
const ADRESSAGE_SHEET = "Adressage";

const MATERIEL_COLUMNS = ["Nom", "Type", "Constructeur", "Modèle", "Salle", "API"];
const LIAISONS_COLUMNS = ["Équipement parent", "Port parent", "Équipement enfant", "Port enfant"];
const ADRESSAGE_COLUMNS = [
  "Équipement",
  "Salle",
  "Port",
  "Type de port",
  "VLAN",
  "Adresse IP",
  "Passerelle",
  "Masque",
  "Adresse Modbus",
];

async function readRowsFromFile(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[MATERIEL_SHEET] ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    return rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
  }
  const text = await file.text();
  return parseCsv(text);
}

export function EquipmentImportExport() {
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
      const [{ equipment }, { links }, { equipment: addressing }] = await Promise.all([
        listEquipment(),
        listEquipmentLinks(),
        listAddressing(),
      ]);

      const materielRows = equipment.map((item) => [
        item.name,
        item.deviceType,
        item.brandName,
        item.hardwareModel,
        `${item.siteName} / ${item.zoneName} / ${item.roomName}`,
        item.apiName ?? "",
      ]);

      const liaisonsRows = links.map((link) => [
        link.parentEquipmentName,
        link.parentPortLabel,
        link.childEquipmentName,
        link.childPortLabel,
      ]);

      const adressageRows = addressing.flatMap((item) =>
        item.ports.map((port) => [
          item.equipmentName,
          `${item.siteName} / ${item.zoneName} / ${item.roomName}`,
          port.label,
          port.portType,
          port.vlan ?? "",
          port.ipAddress ?? "",
          port.gateway ?? "",
          port.subnetMask ?? "",
          port.modbusAddress ?? "",
        ])
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([MATERIEL_COLUMNS, ...materielRows]),
        MATERIEL_SHEET
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([LIAISONS_COLUMNS, ...liaisonsRows]),
        LIAISONS_SHEET
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([ADRESSAGE_COLUMNS, ...adressageRows]),
        ADRESSAGE_SHEET
      );

      XLSX.writeFile(workbook, `materiel-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

      const [{ hardwareModels }, { rooms }, { apis }, { equipment: existingEquipment }] = await Promise.all([
        listHardwareModels(),
        listRooms(),
        listApis(),
        listEquipment(),
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

        // Le nom n'est pas une clé unique en base ; on considère qu'il s'agit du même matériel
        // si un équipement de même nom (insensible à la casse) existe déjà dans la même salle,
        // et on le met à jour plutôt que d'en créer un doublon à chaque réimport.
        const existing = existingEquipment.find(
          (e) => e.roomId === room.id && e.name.trim().toLowerCase() === trimmedName.toLowerCase()
        );

        try {
          if (existing) {
            await updateEquipment(existing.id, {
              roomId: room.id,
              deviceTypeId: hardwareModel.deviceTypeId,
              hardwareModelId: hardwareModel.id,
              apiId,
              name: trimmedName,
              isApiStartPoint: existing.isApiStartPoint,
            });
            results.push({ line, name: trimmedName, status: "success", message: "Mis à jour." });
          } else {
            const { equipment: created } = await createEquipment({
              roomId: room.id,
              deviceTypeId: hardwareModel.deviceTypeId,
              hardwareModelId: hardwareModel.id,
              apiId,
              name: trimmedName,
              isApiStartPoint: false,
            });
            existingEquipment.push(created);
            results.push({ line, name: trimmedName, status: "success", message: "Créé." });
          }
        } catch (err) {
          results.push({
            line,
            name: trimmedName,
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

  const createdCount = importResults?.filter((r) => r.message === "Créé.").length ?? 0;
  const updatedCount = importResults?.filter((r) => r.message === "Mis à jour.").length ?? 0;
  const errorCount = importResults?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="card card-compact-top">
      <h2>Gestion du matériel</h2>

      <h3>Export</h3>
      <p className="muted">
        Télécharge un fichier Excel (.xlsx) avec un onglet par section de Gestion du matériel : "{MATERIEL_SHEET}",
        "{LIAISONS_SHEET}" et "{ADRESSAGE_SHEET}".
      </p>
      <button type="button" className="btn" onClick={handleExport} disabled={exporting}>
        {exporting ? "Préparation..." : "Exporter le matériel (Excel)"}
      </button>
      {exportError && <p className="error">{exportError}</p>}

      <h3>Import</h3>
      <p className="muted">
        Réimportez le fichier Excel téléchargé ci-dessus (ou un .csv équivalent) pour créer ou mettre à jour du
        matériel en masse. Si un équipement du même nom (insensible à la casse) existe déjà dans la salle indiquée,
        il est mis à jour plutôt que dupliqué ; sinon il est créé. Seul l'onglet "{MATERIEL_SHEET}" est utilisé ;
        "{LIAISONS_SHEET}" et "{ADRESSAGE_SHEET}" sont ignorés. Chaque ligne doit indiquer :{" "}
        {MATERIEL_COLUMNS.join(", ")} — le constructeur et le modèle doivent correspondre à un matériel du
        catalogue, la salle au format "Site / Zone / Salle", et l'API est optionnelle.
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
            {createdCount} matériel(s) créé(s), {updatedCount} mis à jour, {errorCount} erreur(s).
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
