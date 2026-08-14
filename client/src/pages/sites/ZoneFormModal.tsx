import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createZone, getZone, updateZone } from "../../api/zones";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";
import { Modal } from "../../components/Modal";

interface ZoneFormModalProps {
  siteId: number;
  siteName: string;
  zoneId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ZoneFormModal({ siteId, siteName, zoneId, onClose, onSaved }: ZoneFormModalProps) {
  const isEdit = zoneId !== null;
  const { refresh } = useSitesTree();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getZone(Number(zoneId))
      .then(({ zone }) => setName(zone.name))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [zoneId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { siteId, name };
      if (isEdit) {
        await updateZone(Number(zoneId), input);
      } else {
        await createZone(input);
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
    <Modal title={isEdit ? "Modifier la zone" : "Ajouter une zone"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="muted">{siteName}</p>
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
