import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteBrand, listBrands } from "../../api/brands";
import type { Brand } from "../../api/brands";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";

function searchFields(item: Brand) {
  return [item.name];
}

export function BrandsListPage() {
  const [items, setItems] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, searchFields);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { brands } = await listBrands();
      setItems(brands);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer ce constructeur ?")) return;
    try {
      await deleteBrand(id);
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
        <Link to="/data-types/brands/new" className="btn">
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
              <td>{item.name}</td>
              <td className="table-actions">
                <Link to={`/data-types/brands/${item.id}/edit`}>Modifier</Link>
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
