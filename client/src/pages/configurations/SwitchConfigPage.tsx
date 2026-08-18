import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteSwitchConfig,
  downloadSwitchConfigXml,
  importSwitchConfig,
  listSupportedSwitchModels,
  listSwitchConfigs,
} from "../../api/switchConfigs";
import type { SupportedSwitchModel, SwitchConfigSummary } from "../../api/switchConfigs";
import { ApiError } from "../../api/client";

export function SwitchConfigPage() {
  const [items, setItems] = useState<SwitchConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [switchModels, setSwitchModels] = useState<SupportedSwitchModel[]>([]);
  const [switchModelId, setSwitchModelId] = useState<number | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!importFile || switchModelId === null) return;
    setImportError(null);
    setImporting(true);
    try {
      await importSwitchConfig(importFile, switchModelId);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
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

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Switch</h2>
      </div>

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
            Fichier XML
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              ref={fileInputRef}
              onChange={(e) => setImportFile(e.currentTarget.files?.[0] ?? null)}
              disabled={importing}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleImport}
            disabled={!importFile || switchModelId === null || importing}
          >
            {importing ? "Import en cours..." : "Importer"}
          </button>
        </div>
        {switchModels.length === 0 && (
          <p className="muted">
            Aucun modèle de switch pris en charge n'est trouvé dans le catalogue (Type des données &gt; Matériel).
          </p>
        )}
        {importError && <p className="error">{importError}</p>}
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
          {items.map((item) => (
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
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">Aucune configuration switch importée.</p>}
    </div>
  );
}
