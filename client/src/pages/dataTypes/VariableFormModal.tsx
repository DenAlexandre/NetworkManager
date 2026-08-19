import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createVariable, getVariable, updateVariable } from "../../api/variables";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface VariableFormModalProps {
  variableId: number | null;
  hardwareModelId: number;
  onClose: () => void;
  onSaved: () => void;
}

export function VariableFormModal({ variableId, hardwareModelId, onClose, onSaved }: VariableFormModalProps) {
  const isEdit = variableId !== null;

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [register, setRegister] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getVariable(variableId)
      .then(({ variable }) => {
        setName(variable.name);
        setUnit(variable.unit);
        setRegister(variable.register);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [variableId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { hardwareModelId, name, unit, register };
      if (isEdit) {
        await updateVariable(variableId, input);
      } else {
        await createVariable(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier la variable" : "Ajouter une variable"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Unité
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
          <label>
            Registre
            <input type="text" value={register} onChange={(e) => setRegister(e.target.value)} />
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
