import { useRef, useState } from "react";
import { listRooms, createRoom } from "../../api/rooms";
import { listSites } from "../../api/sites";
import { listZones, createZone } from "../../api/zones";
import { ApiError } from "../../api/client";
import { parseCsv, toCsvField } from "../../utils/csv";
import type { ImportRowResult } from "../../utils/csv";

const ROOMS_CSV_COLUMNS = ["Nom", "Zone", "Site"];
const IMPORT_ZONE_NAME = "Import";

export function RoomsImport() {
  const [exportingRooms, setExportingRooms] = useState(false);
  const [exportRoomsError, setExportRoomsError] = useState<string | null>(null);

  const [importRoomsFile, setImportRoomsFile] = useState<File | null>(null);
  const [importingRooms, setImportingRooms] = useState(false);
  const [importRoomsError, setImportRoomsError] = useState<string | null>(null);
  const [importRoomsResults, setImportRoomsResults] = useState<ImportRowResult[] | null>(null);
  const roomsFileInputRef = useRef<HTMLInputElement>(null);

  async function handleExportRooms() {
    setExportRoomsError(null);
    setExportingRooms(true);
    try {
      const { rooms } = await listRooms();
      const lines = [ROOMS_CSV_COLUMNS.join(",")];
      for (const room of rooms) {
        lines.push([room.name, room.zoneName, room.siteName].map(toCsvField).join(","));
      }
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `salles-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportRoomsError(err instanceof ApiError ? err.message : "Erreur lors de l'export.");
    } finally {
      setExportingRooms(false);
    }
  }

  async function handleImportRooms() {
    if (!importRoomsFile) return;
    setImportRoomsError(null);
    setImportRoomsResults(null);
    setImportingRooms(true);
    try {
      const text = await importRoomsFile.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        throw new Error("Le fichier est vide.");
      }
      const [, ...dataRows] = rows;

      const [{ sites }, { zones }, { rooms }] = await Promise.all([listSites(), listZones(), listRooms()]);

      const zoneIdByKey = new Map<string, number>();
      for (const zone of zones) {
        zoneIdByKey.set(`${zone.siteId}:${zone.name.trim().toLowerCase()}`, zone.id);
      }
      const existingRoomKeys = new Set(rooms.map((r) => `${r.zoneId}:${r.name.trim().toLowerCase()}`));

      const results: ImportRowResult[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const line = i + 2; // +1 for 0-index, +1 for the header row
        const [name = "", zoneValue = "", siteValue = ""] = dataRows[i];
        const trimmedName = name.trim();
        const trimmedSite = siteValue.trim();
        const zoneName = zoneValue.trim() || IMPORT_ZONE_NAME;

        if (!trimmedName) {
          results.push({ line, name: trimmedName, status: "error", message: "Nom manquant." });
          continue;
        }
        if (!trimmedSite) {
          results.push({ line, name: trimmedName, status: "error", message: "Site manquant." });
          continue;
        }

        const site = sites.find((s) => s.name.trim().toLowerCase() === trimmedSite.toLowerCase());
        if (!site) {
          results.push({ line, name: trimmedName, status: "error", message: `Site introuvable : "${trimmedSite}".` });
          continue;
        }

        try {
          const zoneKey = `${site.id}:${zoneName.toLowerCase()}`;
          let zoneId = zoneIdByKey.get(zoneKey);
          if (zoneId === undefined) {
            const { zone } = await createZone({ siteId: site.id, name: zoneName });
            zoneId = zone.id;
            zoneIdByKey.set(zoneKey, zoneId);
          }

          const key = `${zoneId}:${trimmedName.toLowerCase()}`;
          if (existingRoomKeys.has(key)) {
            results.push({
              line,
              name: trimmedName,
              status: "error",
              message: `Une salle "${trimmedName}" existe déjà dans la zone "${zoneName}" de "${site.name}".`,
            });
            continue;
          }

          await createRoom({ zoneId, name: trimmedName });
          existingRoomKeys.add(key);
          results.push({
            line,
            name: trimmedName,
            status: "success",
            message: `Créée dans "${site.name} / ${zoneName}".`,
          });
        } catch (err) {
          results.push({
            line,
            name: trimmedName,
            status: "error",
            message: err instanceof ApiError ? err.message : "Erreur lors de la création.",
          });
        }
      }
      setImportRoomsResults(results);
      setImportRoomsFile(null);
      if (roomsFileInputRef.current) roomsFileInputRef.current.value = "";
    } catch (err) {
      setImportRoomsError(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setImportingRooms(false);
    }
  }

  const successRoomsCount = importRoomsResults?.filter((r) => r.status === "success").length ?? 0;
  const errorRoomsCount = importRoomsResults?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="card card-compact-top">
      <h2>Import de salles</h2>

      <h3>Export</h3>
      <p className="muted">Télécharge la liste complète des salles au format CSV (compatible Excel).</p>
      <button type="button" className="btn" onClick={handleExportRooms} disabled={exportingRooms}>
        {exportingRooms ? "Préparation..." : "Exporter les salles (CSV)"}
      </button>
      {exportRoomsError && <p className="error">{exportRoomsError}</p>}

      <h3>Import</h3>
      <p className="muted">
        Colonnes attendues : {ROOMS_CSV_COLUMNS.join(", ")}. Le site doit correspondre exactement à un site existant
        (Gestion des Sites). La salle est créée dans la zone indiquée par la colonne Zone (créée automatiquement
        dans ce site si besoin) ; si la colonne Zone est laissée vide, la zone "{IMPORT_ZONE_NAME}" est utilisée par
        défaut.
      </p>
      <div className="inline-form">
        <label>
          Fichier CSV
          <input
            type="file"
            accept=".csv,text/csv"
            ref={roomsFileInputRef}
            onChange={(e) => setImportRoomsFile(e.currentTarget.files?.[0] ?? null)}
            disabled={importingRooms}
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={handleImportRooms}
          disabled={!importRoomsFile || importingRooms}
        >
          {importingRooms ? "Import en cours..." : "Importer"}
        </button>
      </div>
      {importRoomsError && <p className="error">{importRoomsError}</p>}

      {importRoomsResults && (
        <>
          <p className="muted">
            {successRoomsCount} salle(s) créée(s), {errorRoomsCount} erreur(s).
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
              {importRoomsResults.map((r) => (
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
