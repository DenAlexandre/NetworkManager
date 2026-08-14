import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createApi, getApi, updateApi } from "../../api/apis";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface ApiFormModalProps {
  apiId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ApiFormModal({ apiId, onClose, onSaved }: ApiFormModalProps) {
  const isEdit = apiId !== null;

  const [name, setName] = useState("");
  const [migrationDate, setMigrationDate] = useState("");
  const [completed, setCompleted] = useState(false);
  const [doeUpToDate, setDoeUpToDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getApi(Number(apiId))
      .then(({ api }) => {
        setName(api.name);
        setMigrationDate(api.migrationDate ?? "");
        setCompleted(api.completed);
        setDoeUpToDate(api.doeUpToDate);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [apiId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, migrationDate: migrationDate || null, completed, doeUpToDate };
      if (isEdit) {
        await updateApi(Number(apiId), input);
      } else {
        await createApi(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier l'API" : "Ajouter une API"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Date de migration
            <input type="date" value={migrationDate} onChange={(e) => setMigrationDate(e.target.value)} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} />
            Terminé
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={doeUpToDate} onChange={(e) => setDoeUpToDate(e.target.checked)} />
            DOE à jour
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
