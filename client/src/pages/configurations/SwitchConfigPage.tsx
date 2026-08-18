import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  applySwitchConfigToEquipment,
  deleteSwitchConfig,
  downloadSwitchConfigXml,
  importSwitchConfig,
  listSupportedSwitchModels,
  listSwitchConfigs,
} from "../../api/switchConfigs";
import type { RoomOption, SupportedSwitchModel, SwitchConfigSummary } from "../../api/switchConfigs";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination";

export function SwitchConfigPage() {
  const [items, setItems] = useState<SwitchConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { page, setPage, pageCount, pagedItems } = usePagination(items);

  const [switchModels, setSwitchModels] = useState<SupportedSwitchModel[]>([]);
  const [switchModelId, setSwitchModelId] = useState<number | null>(null);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [roomPicker, setRoomPicker] = useState<{ item: SwitchConfigSummary; rooms: RoomOption[]; isBulk?: boolean } | null>(
    null
  );
  const [pickedRoomId, setPickedRoomId] = useState<number | "">("");
  const [applyError, setApplyError] = useState<string | null>(null);

  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkStats, setBulkStats] = useState<{ done: number; total: number; errors: string[] } | null>(null);
  const bulkQueueRef = useRef<SwitchConfigSummary[]>([]);

  useEffect(() => {
    load();
    loadSupportedModels();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { switchConfigs } = await listSwitchConfigs();
      setItems(switchConfigs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupportedModels() {
    try {
      const { hardwareModels } = await listSupportedSwitchModels();
      setSwitchModels(hardwareModels);
      setSwitchModelId(hardwareModels[0]?.id ?? null);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Erreur de chargement des modèles.");
    }
  }

  async function handleImport() {
    if (importFiles.length === 0 || switchModelId === null) return;
    setImportError(null);
    setImporting(true);
    setImportProgress({ done: 0, total: importFiles.length });
    const errors: string[] = [];
    for (const file of importFiles) {
      try {
        await importSwitchConfig(file, switchModelId);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Erreur lors de l'import.";
        errors.push(`${file.name} : ${message}`);
      }
      setImportProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    setImportFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setImportError(errors.length > 0 ? errors.join("\n") : null);
    setImporting(false);
    await load();
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette configuration ?")) return;
    try {
      await deleteSwitchConfig(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleDownload(id: number) {
    try {
      await downloadSwitchConfigXml(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors du téléchargement.");
    }
  }

  async function handleApplyToEquipment(item: SwitchConfigSummary, roomId?: number) {
    setApplyingId(item.id);
    setApplyError(null);
    try {
      const result = await applySwitchConfigToEquipment(item.id, roomId);
      if (result.requiresRoomSelection) {
        setRoomPicker({ item, rooms: result.rooms ?? [] });
        setPickedRoomId("");
        return;
      }
      setRoomPicker(null);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Erreur lors de la mise à jour du matériel.";
      if (roomPicker) {
        setApplyError(message);
      } else {
        alert(message);
      }
    } finally {
      setApplyingId(null);
    }
  }

  function handleConfirmRoomPicker() {
    if (!roomPicker || pickedRoomId === "") return;
    if (roomPicker.isBulk) {
      const item = roomPicker.item;
      const roomId = Number(pickedRoomId);
      setRoomPicker(null);
      resolveBulkItem(item, roomId);
      return;
    }
    handleApplyToEquipment(roomPicker.item, Number(pickedRoomId));
  }

  function recordBulkOutcome(error?: string) {
    setBulkStats((prev) => {
      if (!prev) return prev;
      return { done: prev.done + 1, total: prev.total, errors: error ? [...prev.errors, error] : prev.errors };
    });
  }

  async function resolveBulkItem(item: SwitchConfigSummary, roomId: number) {
    try {
      await applySwitchConfigToEquipment(item.id, roomId);
      recordBulkOutcome();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Erreur lors de la mise à jour du matériel.";
      recordBulkOutcome(`${item.sysName || "?"} : ${message}`);
    }
    await runBulkQueue();
  }

  async function runBulkQueue() {
    while (bulkQueueRef.current.length > 0) {
      const [current, ...rest] = bulkQueueRef.current;
      bulkQueueRef.current = rest;
      try {
        const result = await applySwitchConfigToEquipment(current.id);
        if (result.requiresRoomSelection) {
          setRoomPicker({ item: current, rooms: result.rooms ?? [], isBulk: true });
          setPickedRoomId("");
          return; // paused until the room picker is confirmed or skipped
        }
        recordBulkOutcome();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Erreur lors de la mise à jour du matériel.";
        recordBulkOutcome(`${current.sysName || "?"} : ${message}`);
      }
    }
    setBulkUpdating(false);
    await load();
  }

  function handleBulkUpdate() {
    if (items.length === 0 || bulkUpdating) return;
    bulkQueueRef.current = [...items];
    setBulkStats({ done: 0, total: items.length, errors: [] });
    setBulkUpdating(true);
    runBulkQueue();
  }

  function handleSkipRoomPicker() {
    if (!roomPicker) return;
    const wasBulk = roomPicker.isBulk;
    setRoomPicker(null);
    if (wasBulk) {
      recordBulkOutcome(`${roomPicker.item.sysName || "?"} : Salle non choisie, mise à jour ignorée.`);
      runBulkQueue();
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Switch</h2>
        <button type="button" className="btn" onClick={handleBulkUpdate} disabled={items.length === 0 || bulkUpdating}>
          {bulkUpdating && bulkStats ? `Mise à jour... (${bulkStats.done}/${bulkStats.total})` : "Update complet"}
        </button>
      </div>
      {bulkStats && !bulkUpdating && (
        <p className={bulkStats.errors.length > 0 ? "error" : "success"}>
          {bulkStats.done - bulkStats.errors.length} mis à jour, {bulkStats.errors.length} erreur(s).
          {bulkStats.errors.length > 0 && (
            <>
              <br />
              {bulkStats.errors.map((e, i) => (
                <span key={i}>
                  {e}
                  <br />
                </span>
              ))}
            </>
          )}
        </p>
      )}

      <div className="card card-compact-top">
        <h2>Importer une configuration</h2>
        <p className="muted">
          Fichier XML exporté d'un switch HIRSCMANN-BRS30 (namespace <code>mibconf</code>).
        </p>
        <div className="inline-form">
          <label>
            Modèle de switch
            <select
              value={switchModelId ?? ""}
              onChange={(e) => setSwitchModelId(Number(e.target.value))}
              disabled={importing || switchModels.length === 0}
            >
              {switchModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brandName} — {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fichier(s) XML
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              multiple
              ref={fileInputRef}
              onChange={(e) => setImportFiles(Array.from(e.currentTarget.files ?? []))}
              disabled={importing}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleImport}
            disabled={importFiles.length === 0 || switchModelId === null || importing}
          >
            {importing
              ? `Import en cours... (${importProgress.done}/${importProgress.total})`
              : importFiles.length > 1
                ? `Importer (${importFiles.length} fichiers)`
                : "Importer"}
          </button>
        </div>
        {importFiles.length > 1 && (
          <p className="muted">{importFiles.map((f) => f.name).join(", ")}</p>
        )}
        {switchModels.length === 0 && (
          <p className="muted">
            Aucun modèle de switch pris en charge n'est trouvé dans le catalogue (Type des données &gt; Matériel).
          </p>
        )}
        {importError && (
          <p className="error">
            {importError.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Modèle (catalogue)</th>
            <th>Modèle</th>
            <th>Firmware</th>
            <th>Localisation</th>
            <th>IP de gestion</th>
            <th>VLANs</th>
            <th>Ports actifs</th>
            <th>Importé le</th>
            <th>Importé par</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/configurations/${item.id}`}>{item.sysName || "—"}</Link>
              </td>
              <td>
                {item.brandName} — {item.hardwareModelName}
              </td>
              <td>{item.productId}</td>
              <td>{item.firmwareVersion}</td>
              <td>{item.sysLocation}</td>
              <td>
                {item.managementIp}/{item.prefixLength}
              </td>
              <td>{item.vlanCount}</td>
              <td>
                {item.activePortCount} / {item.portCount}
              </td>
              <td>{new Date(item.importedAt).toLocaleString()}</td>
              <td>{item.importedBy}</td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => handleDownload(item.id)}>
                  XML
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => handleApplyToEquipment(item)}
                  disabled={applyingId === item.id}
                >
                  {applyingId === item.id ? "Mise à jour..." : "Update"}
                </button>
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">Aucune configuration switch importée.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />

      {roomPicker && (
        <Modal title="Choisir la salle" onClose={handleSkipRoomPicker}>
          <p>
            Impossible de déterminer automatiquement la salle pour l'équipement "{roomPicker.item.sysName}"
            (localisation "{roomPicker.item.sysLocation}" introuvable ou ambiguë). Choisissez une salle :
          </p>
          {roomPicker.isBulk && (
            <p className="muted">Mise à jour groupée en cours — les autres configurations suivront ensuite.</p>
          )}
          <label>
            Salle
            <select value={pickedRoomId} onChange={(e) => setPickedRoomId(Number(e.target.value))}>
              <option value="" disabled>
                — Sélectionner —
              </option>
              {roomPicker.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.siteName} / {room.zoneName} / {room.name}
                </option>
              ))}
            </select>
          </label>
          {applyError && <p className="error">{applyError}</p>}
          <div className="modal-actions">
            <button type="button" onClick={handleSkipRoomPicker}>
              {roomPicker.isBulk ? "Ignorer celle-ci" : "Annuler"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleConfirmRoomPicker}
              disabled={pickedRoomId === "" || applyingId === roomPicker.item.id}
            >
              {applyingId === roomPicker.item.id ? "Mise à jour..." : "Valider"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
