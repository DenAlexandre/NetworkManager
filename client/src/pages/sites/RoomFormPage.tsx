import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createRoom, getRoom, updateRoom } from "../../api/rooms";
import { ApiError } from "../../api/client";

export function RoomFormPage() {
  const { siteId, zoneId, roomId } = useParams();
  const isEdit = Boolean(roomId);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getRoom(Number(roomId))
      .then(({ room }) => setName(room.name))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [roomId, isEdit]);

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
