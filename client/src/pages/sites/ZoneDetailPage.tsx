import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getZone } from "../../api/zones";
import type { Zone } from "../../api/zones";
import { deleteRoom, listRooms } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { ApiError } from "../../api/client";

export function ZoneDetailPage() {
  const { siteId, zoneId } = useParams();
  const [zone, setZone] = useState<Zone | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [zoneId]);

  async function load() {
    setLoading(true);
    try {
      const [{ zone: z }, { rooms: r }] = await Promise.all([
        getZone(Number(zoneId)),
        listRooms(Number(zoneId)),
      ]);
      setZone(z);
      setRooms(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette salle ?")) return;
    try {
      await deleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!zone) return null;

  return (
    <div className="card">
      <div className="page-header">
        <h1>{zone.name}</h1>
        <Link to={`/sites/${siteId}/zones/${zone.id}/rooms/new`} className="btn">
          Ajouter une salle
        </Link>
      </div>
      <p className="muted">
        <Link to={`/sites/${siteId}`}>← Retour à {zone.siteName}</Link>
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Salle</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id}>
              <td>
                <Link to={`/sites/${siteId}/zones/${zone.id}/rooms/${room.id}`}>{room.name}</Link>
              </td>
              <td className="table-actions">
                <Link to={`/sites/${siteId}/zones/${zone.id}/rooms/${room.id}/edit`}>Modifier</Link>
                <button className="danger" onClick={() => handleDelete(room.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rooms.length === 0 && <p className="muted">Aucune salle pour cette zone.</p>}
    </div>
  );
}
