import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteApi, listApis } from "../../api/apis";
import type { Api } from "../../api/apis";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";

function searchFields(item: Api) {
  return [item.name];
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

export function ApisListPage() {
  const [items, setItems] = useState<Api[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, searchFields);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { apis } = await listApis();
      setItems(apis);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette API ?")) return;
    try {
      await deleteApi(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Gestion des API</h1>
        <Link to="/apis/new" className="btn">
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
            <SortableHeader
              label="Date de migration"
              field="migrationDate"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <th>Terminé</th>
            <th>DOE à jour</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{formatDate(item.migrationDate)}</td>
              <td>{item.completed ? "Oui" : "Non"}</td>
              <td>{item.doeUpToDate ? "Oui" : "Non"}</td>
              <td className="table-actions">
                <Link to={`/apis/${item.id}/edit`}>Modifier</Link>
                <button className="danger" onClick={() => handleDelete(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucune API enregistrée.</p>}
    </div>
  );
}
