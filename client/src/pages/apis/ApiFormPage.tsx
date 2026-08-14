import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createApi, getApi, updateApi } from "../../api/apis";
import { ApiError } from "../../api/client";

export function ApiFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [migrationDate, setMigrationDate] = useState("");
  const [completed, setCompleted] = useState(false);
  const [doeUpToDate, setDoeUpToDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getApi(Number(id))
      .then(({ api }) => {
        setName(api.name);
        setMigrationDate(api.migrationDate ?? "");
        setCompleted(api.completed);
        setDoeUpToDate(api.doeUpToDate);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, migrationDate: migrationDate || null, completed, doeUpToDate };
      if (isEdit) {
        await updateApi(Number(id), input);
      } else {
        await createApi(input);
      }
      navigate("/apis");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier l'API" : "Ajouter une API"}</h1>
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
          <button type="button" className="btn-outline" onClick={() => navigate("/apis")}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
