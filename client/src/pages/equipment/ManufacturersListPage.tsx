import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteManufacturer, listManufacturers } from "../../api/manufacturers";
import type { Manufacturer } from "../../api/manufacturers";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";

function searchFields(item: Manufacturer) {
  return [item.deviceType, item.manufacturer, item.reference, item.docPath];
}

export function ManufacturersListPage() {
  const [items, setItems] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, searchFields);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { manufacturers } = await listManufacturers();
      setItems(manufacturers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce constructeur ?")) return;
    try {
      await deleteManufacturer(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Constructeurs</h2>
        <Link to="/equipment/manufacturers/new" className="btn">
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
              label="Type"
              field="deviceType"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableHeader
              label="Constructeur"
              field="manufacturer"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableHeader
              label="Référence"
              field="reference"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableHeader
              label="Doc technique"
              field="docPath"
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
              <td>{item.deviceType}</td>
              <td>{item.manufacturer}</td>
              <td>{item.reference || "—"}</td>
              <td>{item.docPath || "—"}</td>
              <td className="table-actions">
                <Link to={`/equipment/manufacturers/${item.id}/edit`}>Modifier</Link>
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucun constructeur enregistré.</p>}
    </div>
  );
}
