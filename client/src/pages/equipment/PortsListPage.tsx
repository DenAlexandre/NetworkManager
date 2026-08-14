import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { bulkCreatePorts, deletePort, listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { listLinkTypes } from "../../api/linkTypes";
import type { LinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";

function searchFields(item: Port) {
  return [item.hardwareModelName, item.manufacturerName, item.portType, item.label];
}

export function PortsListPage() {
  const [items, setItems] = useState<Port[]>([]);
  const [hardwareModels, setHardwareModels] = useState<HardwareModel[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, searchFields);

  const [bulkHardwareModelId, setBulkHardwareModelId] = useState<number | "">("");
  const [bulkLinkTypeId, setBulkLinkTypeId] = useState<number | "">("");
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ ports }, { hardwareModels: hmList }, { linkTypes: ltList }] = await Promise.all([
        listPorts(),
        listHardwareModels(),
        listLinkTypes(),
      ]);
      setItems(ports);
      setHardwareModels(hmList);
      setLinkTypes(ltList);
      setBulkHardwareModelId((prev) => (prev === "" && hmList.length > 0 ? hmList[0].id : prev));
      setBulkLinkTypeId((prev) => (prev === "" && ltList.length > 0 ? ltList[0].id : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette entrée/sortie ?")) return;
    try {
      await deletePort(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleBulkGenerate(e: FormEvent) {
    e.preventDefault();
    if (bulkHardwareModelId === "" || bulkLinkTypeId === "") return;
    setBulkError(null);
    setBulkSubmitting(true);
    try {
      await bulkCreatePorts({
        hardwareModelId: Number(bulkHardwareModelId),
        linkTypeId: Number(bulkLinkTypeId),
        quantity: bulkQuantity,
      });
      await load();
    } catch (err) {
      setBulkError(err instanceof ApiError ? err.message : "Erreur lors de la génération.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div className="card">
        <h2>Générer des ports</h2>
        <form className="inline-form" onSubmit={handleBulkGenerate}>
          <label>
            Matériel
            <select
              value={bulkHardwareModelId}
              onChange={(e) => setBulkHardwareModelId(Number(e.target.value))}
              required
            >
              {hardwareModels.map((hm) => (
                <option key={hm.id} value={hm.id}>
                  {hm.brandName} — {hm.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type de liaison
            <select
              value={bulkLinkTypeId}
              onChange={(e) => setBulkLinkTypeId(Number(e.target.value))}
              required
            >
              {linkTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantité
            <input
              type="number"
              min={1}
              max={200}
              value={bulkQuantity}
              onChange={(e) => setBulkQuantity(Number(e.target.value))}
              required
            />
          </label>
          <button type="submit" disabled={bulkSubmitting}>
            Générer
          </button>
        </form>
        {bulkError && <p className="error">{bulkError}</p>}
      </div>
      <div className="card">
        <div className="page-header">
          <h2>Entrées / Sorties</h2>
          <Link to="/equipment/ports/new" className="btn">
            Ajouter
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="table-toolbar">
          <input
            type="search"
            placeholder="Filtrer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <table className="table">
          <thead>
            <tr>
              <SortableHeader
                label="Matériel"
                field="hardwareModelName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Constructeur"
                field="manufacturerName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Type de liaison"
                field="portType"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader
                label="Label"
                field="label"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.hardwareModelName}</td>
                <td>{item.manufacturerName}</td>
                <td>{item.portType}</td>
                <td>{item.label}</td>
                <td className="table-actions">
                  <Link to={`/equipment/ports/${item.id}/edit`}>Modifier</Link>
                  <button className="danger" onClick={() => handleDelete(item.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Aucune entrée/sortie enregistrée.</p>}
      </div>
    </div>
  );
}
