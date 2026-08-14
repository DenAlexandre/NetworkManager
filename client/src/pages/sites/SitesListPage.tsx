import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSite, listSites } from "../../api/sites";
import type { Site } from "../../api/sites";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";
import { useSitesTree } from "../../context/SitesTreeContext";

function searchFields(item: Site) {
  return [item.name];
}

export function SitesListPage() {
  const [items, setItems] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, searchFields);
  const { refresh } = useSitesTree();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { sites } = await listSites();
      setItems(sites);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce site ?")) return;
    try {
      await deleteSite(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Gestion des Sites</h1>
        <Link to="/sites/new" className="btn">
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
            <SortableHeader label="Nom" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/sites/${item.id}`}>{item.name}</Link>
              </td>
              <td className="table-actions">
                <Link to={`/sites/${item.id}/edit`}>Modifier</Link>
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucun site enregistré.</p>}
    </div>
  );
}
