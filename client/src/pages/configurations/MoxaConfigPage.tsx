import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteMgateConfig, downloadMgateConfigCfg, importMgateConfigCfg, listMgateConfigs } from "../../api/mgateConfigs";
import type { MgateConfigSummary } from "../../api/mgateConfigs";
import { ApiError } from "../../api/client";

// Modèles de passerelle Moxa supportés par l'import. Un seul pour l'instant : d'autres modèles
// nécessiteront chacun leur propre parseur côté serveur avant de pouvoir être ajoutés ici.
const MOXA_MODELS = [{ value: "moxa-mgate-mb3480", label: "MOXA — MGate MB3480" }];

export function MoxaConfigPage() {
  const [items, setItems] = useState<MgateConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [moxaModel, setMoxaModel] = useState(MOXA_MODELS[0].value);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
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

  async function handleImport() {
    if (!importFile) return;
    setImportError(null);
    setImporting(true);
    try {
      await importMgateConfigCfg(importFile, moxaModel);
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
            <select value={moxaModel} onChange={(e) => setMoxaModel(e.target.value)} disabled={importing}>
              {MOXA_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
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
          <button type="button" className="btn" onClick={handleImport} disabled={!importFile || importing}>
            {importing ? "Import en cours..." : "Importer"}
          </button>
        </div>
        {importError && <p className="error">{importError}</p>}
      </div>

      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Nom</th>
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
