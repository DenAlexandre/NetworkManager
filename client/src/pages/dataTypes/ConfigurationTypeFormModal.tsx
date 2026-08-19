import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createConfigurationType, getConfigurationType, updateConfigurationType } from "../../api/configurationTypes";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface ConfigurationTypeFormModalProps {
  configurationTypeId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ConfigurationTypeFormModal({ configurationTypeId, onClose, onSaved }: ConfigurationTypeFormModalProps) {
  const isEdit = configurationTypeId !== null;

  const [name, setName] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getConfigurationType(Number(configurationTypeId))
      .then(({ configurationType }) => {
        setName(configurationType.name);
        setConfiguration(configurationType.configuration);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [configurationTypeId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, configuration };
      if (isEdit) {
        await updateConfigurationType(Number(configurationTypeId), input);
      } else {
        await createConfigurationType(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier le type de configuration" : "Ajouter un type de configuration"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Configuration
            <textarea rows={6} value={configuration} onChange={(e) => setConfiguration(e.target.value)} />
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
