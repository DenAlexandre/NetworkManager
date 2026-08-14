import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createLinkType, getLinkType, updateLinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";

export function LinkTypeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getLinkType(Number(id))
      .then(({ linkType }) => setName(linkType.name))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateLinkType(Number(id), { name });
      } else {
        await createLinkType({ name });
      }
      navigate("/data-types/link-types");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier le type de liaison" : "Ajouter un type de liaison"}</h1>
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
            onClick={() => navigate("/data-types/link-types")}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
