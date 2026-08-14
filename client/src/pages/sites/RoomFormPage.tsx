import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createRoom, getRoom, updateRoom } from "../../api/rooms";
import { getZone } from "../../api/zones";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";

export function RoomFormPage() {
  const { siteId, zoneId, roomId } = useParams();
  const isEdit = Boolean(roomId);
  const navigate = useNavigate();
  const { refresh } = useSitesTree();

  const [zoneName, setZoneName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const { zone } = await getZone(Number(zoneId));
      setZoneName(zone.name);
      setSiteName(zone.siteName);
      if (isEdit) {
        const { room } = await getRoom(Number(roomId));
        setName(room.name);
      }
    }
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [zoneId, roomId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { zoneId: Number(zoneId), name };
      if (isEdit) {
        await updateRoom(Number(roomId), input);
      } else {
        await createRoom(input);
      }
      refresh();
      navigate(`/sites/${siteId}/zones/${zoneId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier la salle" : "Ajouter une salle"}</h1>
      <p className="muted">
        {siteName} / {zoneName}
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Nom
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            Enregistrer
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate(`/sites/${siteId}/zones/${zoneId}`)}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
