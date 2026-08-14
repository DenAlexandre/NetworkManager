import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSite } from "../../api/sites";
import type { Site } from "../../api/sites";
import { deleteZone, listZones } from "../../api/zones";
import type { Zone } from "../../api/zones";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";
import { ZoneFormModal } from "./ZoneFormModal";

export function SiteDetailPage() {
  const { siteId } = useParams();
  const [site, setSite] = useState<Site | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useSitesTree();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [siteId]);

  async function load() {
    setLoading(true);
    try {
      const [{ site: s }, { zones: z }] = await Promise.all([
        getSite(Number(siteId)),
        listZones(Number(siteId)),
      ]);
      setSite(s);
      setZones(z);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette zone ?")) return;
    try {
      await deleteZone(id);
      setZones((prev) => prev.filter((z) => z.id !== id));
      refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function openCreateModal() {
    setEditingId(null);
    setModalOpen(true);
  }

  function openEditModal(id: number) {
    setEditingId(id);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    load();
  }

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!site) return null;

  return (
    <div className="card">
      <div className="page-header">
        <h1>{site.name}</h1>
        <button type="button" className="btn" onClick={openCreateModal}>
          Ajouter une zone
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Zone</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => (
            <tr key={zone.id}>
              <td>
                <Link to={`/sites/${site.id}/zones/${zone.id}`}>{zone.name}</Link>
              </td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => openEditModal(zone.id)}>
                  Modifier
                </button>
                <button className="danger" onClick={() => handleDelete(zone.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {zones.length === 0 && <p className="muted">Aucune zone pour ce site.</p>}
      {modalOpen && (
        <ZoneFormModal
          siteId={site.id}
          siteName={site.name}
          zoneId={editingId}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
