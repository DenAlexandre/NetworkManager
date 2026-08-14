import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createDeviceType, getDeviceType, updateDeviceType } from "../../api/deviceTypes";
import { ApiError } from "../../api/client";

export function DeviceTypeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getDeviceType(Number(id))
      .then(({ deviceType }) => setName(deviceType.name))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateDeviceType(Number(id), { name });
      } else {
        await createDeviceType({ name });
      }
      navigate("/data-types");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier le type de matériel" : "Ajouter un type de matériel"}</h1>
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
          <button type="button" className="btn-outline" onClick={() => navigate("/data-types")}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
