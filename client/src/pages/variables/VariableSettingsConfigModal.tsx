import { useState } from "react";
import { saveEquipmentVariableSetting } from "../../api/equipmentVariableSettings";
import type { EquipmentVariableSettings, VariableSetting } from "../../api/equipmentVariableSettings";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface VariableFields {
  mnemonic: string;
  uniqueId: string;
  description: string;
}

function fieldsFromVariable(v: VariableSetting): VariableFields {
  return { mnemonic: v.mnemonic, uniqueId: v.uniqueId, description: v.description };
}

interface VariableSettingsConfigModalProps {
  equipment: EquipmentVariableSettings;
  onClose: () => void;
}

export function VariableSettingsConfigModal({ equipment, onClose }: VariableSettingsConfigModalProps) {
  const [drafts, setDrafts] = useState<Record<number, VariableFields>>(() => {
    const initial: Record<number, VariableFields> = {};
    for (const variable of equipment.variables) {
      initial[variable.hardwareModelVariableId] = fieldsFromVariable(variable);
    }
    return initial;
  });
  const [variableErrors, setVariableErrors] = useState<Record<number, string>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllError, setSaveAllError] = useState<string | null>(null);

  function updateDraft(variableId: number, field: keyof VariableFields, value: string) {
    setDrafts((prev) => ({ ...prev, [variableId]: { ...prev[variableId], [field]: value } }));
  }

  async function handleSaveAll() {
    setSavingAll(true);
    setSaveAllError(null);
    const errors: string[] = [];
    for (const variable of equipment.variables) {
      const draft = drafts[variable.hardwareModelVariableId];
      try {
        const { variable: updated } = await saveEquipmentVariableSetting({
          equipmentId: equipment.equipmentId,
          hardwareModelVariableId: variable.hardwareModelVariableId,
          mnemonic: draft.mnemonic,
          uniqueId: draft.uniqueId,
          description: draft.description,
        });
        setDrafts((prev) => ({ ...prev, [updated.hardwareModelVariableId]: fieldsFromVariable(updated) }));
        setVariableErrors((prev) => {
          const next = { ...prev };
          delete next[variable.hardwareModelVariableId];
          return next;
        });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.";
        errors.push(`${variable.name} : ${message}`);
        setVariableErrors((prev) => ({ ...prev, [variable.hardwareModelVariableId]: message }));
      }
    }
    setSavingAll(false);
    if (errors.length === 0) {
      onClose();
    } else {
      setSaveAllError(errors.join("\n"));
    }
  }

  return (
    <Modal title={`Variables — ${equipment.equipmentName}`} onClose={onClose} xwide>
      <p className="muted">
        {equipment.brandName} — {equipment.hardwareModel} · {equipment.siteName} / {equipment.zoneName} /{" "}
        {equipment.roomName}
      </p>
      <div className="variables-config-table-wrapper">
      <table className="table variables-config-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Unité</th>
            <th>Registre</th>
            <th>Mnémonique</th>
            <th>ID Unique</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {equipment.variables.map((variable) => {
            const draft = drafts[variable.hardwareModelVariableId] ?? fieldsFromVariable(variable);
            return (
              <tr key={variable.hardwareModelVariableId}>
                <td>{variable.name}</td>
                <td>{variable.unit || "—"}</td>
                <td>{variable.register || "—"}</td>
                <td>
                  <input
                    type="text"
                    value={draft.mnemonic}
                    onChange={(e) => updateDraft(variable.hardwareModelVariableId, "mnemonic", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={draft.uniqueId}
                    onChange={(e) => updateDraft(variable.hardwareModelVariableId, "uniqueId", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => updateDraft(variable.hardwareModelVariableId, "description", e.target.value)}
                  />
                  {variableErrors[variable.hardwareModelVariableId] && (
                    <p className="error">{variableErrors[variable.hardwareModelVariableId]}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {saveAllError && (
        <p className="error">
          {saveAllError.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" disabled={savingAll} onClick={handleSaveAll}>
          {savingAll ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}
