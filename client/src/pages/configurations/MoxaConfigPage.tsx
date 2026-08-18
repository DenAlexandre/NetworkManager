import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteMgateConfig,
  downloadMgateConfigCfg,
  importMgateConfigCfg,
  listMgateConfigs,
  listSupportedMoxaModels,
} from "../../api/mgateConfigs";
import type { MgateConfigSummary, SupportedMoxaModel } from "../../api/mgateConfigs";
import { ApiError } from "../../api/client";

export function MoxaConfigPage() {
  const [items, setItems] = useState<MgateConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [moxaModels, setMoxaModels] = useState<SupportedMoxaModel[]>([]);
  const [moxaModelId, setMoxaModelId] = useState<number | null>(null);
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
      const { mgateConfigs } = await listMgateConfigs();
      setItems(mgateConfigs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupportedModels() {
    try {
      const { hardwareModels } = await listSupportedMoxaModels();
      setMoxaModels(hardwareModels);
      setMoxaModelId(hardwareModels[0]?.id ?? null);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Erreur de chargement des modèles.");
    }
  }

  async function handleImport() {
    if (!importFile || moxaModelId === null) return;
    setImportError(null);
    setImporting(true);
    try {
      await importMgateConfigCfg(importFile, moxaModelId);
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
      await deleteMgateConfig(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleDownload(id: number) {
    try {
      await downloadMgateConfigCfg(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors du téléchargement.");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Moxa</h2>
      </div>

      <div className="card card-compact-top">
        <h2>Importer une configuration</h2>
        <p className="muted">
          Fichier binaire <code>.cfg</code> exporté par MGateManager pour une passerelle MOXA MGate MB3480.
        </p>
        <div className="inline-form">
          <label>
            Modèle de passerelle
            <select
              value={moxaModelId ?? ""}
              onChange={(e) => setMoxaModelId(Number(e.target.value))}
              disabled={importing || moxaModels.length === 0}
            >
              {moxaModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brandName} — {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fichier .cfg
            <input
              type="file"
              accept=".cfg"
              ref={fileInputRef}
              onChange={(e) => setImportFile(e.currentTarget.files?.[0] ?? null)}
              disabled={importing}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleImport}
            disabled={!importFile || moxaModelId === null || importing}
          >
            {importing ? "Import en cours..." : "Importer"}
          </button>
        </div>
        {moxaModels.length === 0 && (
          <p className="muted">
            Aucun modèle de passerelle pris en charge n'est trouvé dans le catalogue (Type des données &gt; Matériel).
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
            <th>IP</th>
            <th>Localisation</th>
            <th>Ports série</th>
            <th>Importé le</th>
            <th>Importé par</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/configurations/moxa/${item.id}`}>{item.deviceName || "—"}</Link>
              </td>
              <td>
                {item.brandName} — {item.hardwareModelName}
              </td>
              <td>{item.ipAddress}</td>
              <td>{item.location || "—"}</td>
              <td>{item.serialPortCount}</td>
              <td>{new Date(item.importedAt).toLocaleString()}</td>
              <td>{item.importedBy}</td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => handleDownload(item.id)}>
                  CFG
                </button>
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">Aucune configuration Moxa importée.</p>}
    </div>
  );
}
