import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createBrand, getBrand, updateBrand } from "../../api/brands";
import { ApiError } from "../../api/client";

export function BrandFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getBrand(Number(id))
      .then(({ brand }) => setName(brand.name))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateBrand(Number(id), { name });
      } else {
        await createBrand({ name });
      }
      navigate("/data-types/brands");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier le constructeur" : "Ajouter un constructeur"}</h1>
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
            onClick={() => navigate("/data-types/brands")}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
