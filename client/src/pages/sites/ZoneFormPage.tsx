import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createZone, getZone, updateZone } from "../../api/zones";
import { ApiError } from "../../api/client";

export function ZoneFormPage() {
  const { siteId, zoneId } = useParams();
  const isEdit = Boolean(zoneId);
  const navigate = useNavigate();

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
      const input = { siteId: Number(siteId), name };
      if (isEdit) {
        await updateZone(Number(zoneId), input);
      } else {
        await createZone(input);
      }
      navigate(`/sites/${siteId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier la zone" : "Ajouter une zone"}</h1>
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
          <button type="button" className="btn-outline" onClick={() => navigate(`/sites/${siteId}`)}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
