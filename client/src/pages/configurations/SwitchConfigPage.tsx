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
import type {
  AvailableSwitchPort,
  RoomOption,
  SupportedSwitchModel,
  SwitchConfigSummary,
  UnmatchedSwitchPort,
} from "../../api/switchConfigs";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination";

interface PendingApply {
  item: SwitchConfigSummary;
  roomId?: number;
  portMapping?: Record<string, string>;
}

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
  const [roomPicker, setRoomPicker] = useState<{ pending: PendingApply; rooms: RoomOption[]; isBulk?: boolean } | null>(
    null
  );
  const [pickedRoomId, setPickedRoomId] = useState<number | "">("");
  const [portPicker, setPortPicker] = useState<{
    pending: PendingApply;
    unmatchedPorts: UnmatchedSwitchPort[];
    availablePorts: AvailableSwitchPort[];
    isBulk?: boolean;
  } | null>(null);
  const [portMappingChoices, setPortMappingChoices] = useState<Record<string, string>>({});
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

  function recordBulkOutcome(error?: string) {
    setBulkStats((prev) => {
      if (!prev) return prev;
      return { done: prev.done + 1, total: prev.total, errors: error ? [...prev.errors, error] : prev.errors };
    });
  }

  // Drives a single config through apply-to-equipment, pausing on room/port questions and
  // resuming with whatever the room/port pickers have resolved so far (threaded via `pending`).
  // Shared by the single-row "Update" button and the bulk "Update complet" queue.
  async function continueApply(pending: PendingApply, isBulk: boolean): Promise<"paused" | "done"> {
    if (!isBulk) setApplyingId(pending.item.id);
    setApplyError(null);
    try {
      const result = await applySwitchConfigToEquipment(pending.item.id, pending.roomId, pending.portMapping);
      if (result.requiresPortMapping) {
        const unmatchedPorts = result.unmatchedPorts ?? [];
        setPortPicker({ pending, unmatchedPorts, availablePorts: result.availablePorts ?? [], isBulk });
        setPortMappingChoices(Object.fromEntries(unmatchedPorts.map((p) => [p.portName, "new"])));
        return "paused";
      }
      if (result.requiresRoomSelection) {
        setRoomPicker({ pending, rooms: result.rooms ?? [], isBulk });
        setPickedRoomId("");
        return "paused";
      }
      setRoomPicker(null);
      setPortPicker(null);
      if (isBulk) {
        recordBulkOutcome();
      } else {
        await load();
      }
      return "done";
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Erreur lors de la mise à jour du matériel.";
      if (isBulk) {
        recordBulkOutcome(`${pending.item.sysName || "?"} : ${message}`);
      } else if (roomPicker || portPicker) {
        setApplyError(message);
      } else {
        alert(message);
      }
      return "done";
    } finally {
      if (!isBulk) setApplyingId(null);
    }
  }

  function handleApplyToEquipment(item: SwitchConfigSummary) {
    continueApply({ item }, false);
  }

  function handleConfirmRoomPicker() {
    if (!roomPicker || pickedRoomId === "") return;
    const pending = { ...roomPicker.pending, roomId: Number(pickedRoomId) };
    const isBulk = !!roomPicker.isBulk;
    setRoomPicker(null);
    continueApply(pending, isBulk).then((outcome) => {
      if (isBulk && outcome === "done") runBulkQueue();
    });
  }

  function handleSkipRoomPicker() {
    if (!roomPicker) return;
    const { pending, isBulk } = roomPicker;
    setRoomPicker(null);
    if (isBulk) {
      recordBulkOutcome(`${pending.item.sysName || "?"} : Salle non choisie, mise à jour ignorée.`);
      runBulkQueue();
    }
  }

  function handleConfirmPortPicker() {
    if (!portPicker) return;
    const pending = { ...portPicker.pending, portMapping: { ...portMappingChoices } };
    const isBulk = !!portPicker.isBulk;
    setPortPicker(null);
    continueApply(pending, isBulk).then((outcome) => {
      if (isBulk && outcome === "done") runBulkQueue();
    });
  }

  function handleSkipPortPicker() {
    if (!portPicker) return;
    const { pending, isBulk } = portPicker;
    setPortPicker(null);
    if (isBulk) {
      recordBulkOutcome(`${pending.item.sysName || "?"} : Association de ports annulée, mise à jour ignorée.`);
      runBulkQueue();
    }
  }

  async function runBulkQueue() {
    while (bulkQueueRef.current.length > 0) {
      const [current, ...rest] = bulkQueueRef.current;
      bulkQueueRef.current = rest;
      const outcome = await continueApply({ item: current }, true);
      if (outcome === "paused") return; // resumed by the room/port picker confirm handlers
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
            Impossible de déterminer automatiquement la salle pour l'équipement "{roomPicker.pending.item.sysName}"
            (localisation "{roomPicker.pending.item.sysLocation}" introuvable ou ambiguë). Choisissez une salle :
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
              disabled={pickedRoomId === "" || applyingId === roomPicker.pending.item.id}
            >
              {applyingId === roomPicker.pending.item.id ? "Mise à jour..." : "Valider"}
            </button>
          </div>
        </Modal>
      )}

      {portPicker && (
        <Modal title="Associer les ports" onClose={handleSkipPortPicker}>
          <p>
            {portPicker.unmatchedPorts.length} port(s) de la configuration "{portPicker.pending.item.sysName}" ne
            correspondent à aucun port existant du modèle catalogue. Choisissez un port existant auquel les associer,
            ou laissez "Créer un nouveau port" pour chacun :
          </p>
          {portPicker.isBulk && (
            <p className="muted">Mise à jour groupée en cours — les autres configurations suivront ensuite.</p>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Port de la configuration</th>
                <th>Associer à</th>
              </tr>
            </thead>
            <tbody>
              {portPicker.unmatchedPorts.map((p) => (
                <tr key={p.portName}>
                  <td>{p.portName}</td>
                  <td>
                    <select
                      value={portMappingChoices[p.portName] ?? "new"}
                      onChange={(e) => setPortMappingChoices((prev) => ({ ...prev, [p.portName]: e.target.value }))}
                    >
                      <option value="new">Créer un nouveau port ({p.suggestedLinkType})</option>
                      {portPicker.availablePorts.map((ap) => (
                        <option key={ap.id} value={ap.id}>
                          {ap.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {applyError && <p className="error">{applyError}</p>}
          <div className="modal-actions">
            <button type="button" onClick={handleSkipPortPicker}>
              {portPicker.isBulk ? "Ignorer celle-ci" : "Annuler"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleConfirmPortPicker}
              disabled={applyingId === portPicker.pending.item.id}
            >
              {applyingId === portPicker.pending.item.id ? "Mise à jour..." : "Valider"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
