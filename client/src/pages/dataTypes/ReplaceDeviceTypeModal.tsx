import { useState } from "react";
import type { FormEvent } from "react";
import { replaceDeviceType } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface ReplaceDeviceTypeModalProps {
  deviceType: DeviceType;
  otherDeviceTypes: DeviceType[];
  onClose: () => void;
  onReplaced: () => void;
}

export function ReplaceDeviceTypeModal({
  deviceType,
  otherDeviceTypes,
  onClose,
  onReplaced,
}: ReplaceDeviceTypeModalProps) {
  const [replacementId, setReplacementId] = useState<number | "">(otherDeviceTypes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!replacementId) return;
    setError(null);
    setSubmitting(true);
    try {
      await replaceDeviceType(deviceType.id, Number(replacementId));
      onReplaced();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors du remplacement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Remplacer "${deviceType.name}"`} onClose={onClose}>
      <p className="muted">
        Ce type de matériel est utilisé par du matériel existant et ne peut pas être supprimé directement.
        Choisissez un type de remplacement : tout le matériel et les modèles utilisant "{deviceType.name}" seront
        basculés vers ce type, qui sera ensuite supprimé.
      </p>
      {otherDeviceTypes.length === 0 ? (
        <p className="error">Aucun autre type de matériel disponible pour le remplacement.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Remplacer par
            <select value={replacementId} onChange={(e) => setReplacementId(Number(e.target.value))}>
              {otherDeviceTypes.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Remplacement..." : "Remplacer et supprimer"}
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
