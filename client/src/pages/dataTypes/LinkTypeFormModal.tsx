import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createLinkType, getLinkType, updateLinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface LinkTypeFormModalProps {
  linkTypeId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_COLOR = "#8b5cf6";
const DEFAULT_STROKE_WIDTH = 3;

export function LinkTypeFormModal({ linkTypeId, onClose, onSaved }: LinkTypeFormModalProps) {
  const isEdit = linkTypeId !== null;

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [pointToPoint, setPointToPoint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    getLinkType(Number(linkTypeId))
      .then(({ linkType }) => {
        setName(linkType.name);
        setColor(linkType.color);
        setStrokeWidth(linkType.strokeWidth);
        setPointToPoint(linkType.pointToPoint);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [linkTypeId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, color, strokeWidth, pointToPoint };
      if (isEdit) {
        await updateLinkType(Number(linkTypeId), input);
      } else {
        await createLinkType(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier le type de liaison" : "Ajouter un type de liaison"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Couleur
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label>
            Épaisseur du trait (px)
            <input
              type="number"
              min={1}
              max={20}
              step={0.5}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              required
            />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={pointToPoint} onChange={(e) => setPointToPoint(e.target.checked)} />
            Point à point
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
