import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";
import { Modal } from "./Modal";

interface SimpleNameFormModalProps {
  title: string;
  itemId: number | null;
  loadName: (id: number) => Promise<string>;
  save: (name: string) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}

export function SimpleNameFormModal({ title, itemId, loadName, save, onClose, onSaved }: SimpleNameFormModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(itemId !== null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (itemId === null) return;
    loadName(itemId)
      .then(setName)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [itemId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await save(name);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
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
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
