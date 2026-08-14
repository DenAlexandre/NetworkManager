import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoom, getRoom, updateRoom } from "../../api/rooms";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";
import { Modal } from "../../components/Modal";

interface RoomFormModalProps {
  zoneId: number;
  zoneName: string;
  siteName: string;
  roomId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RoomFormModal({ zoneId, zoneName, siteName, roomId, onClose, onSaved }: RoomFormModalProps) {
  const isEdit = roomId !== null;
  const { refresh } = useSitesTree();

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
      const input = { zoneId, name };
      if (isEdit) {
        await updateRoom(Number(roomId), input);
      } else {
        await createRoom(input);
      }
      refresh();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier la salle" : "Ajouter une salle"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="muted">
            {siteName} / {zoneName}
          </p>
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              Enregistrer
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
