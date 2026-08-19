import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { createVariable, deleteVariable, listVariables, updateVariable } from "../../api/variables";
import type { Variable } from "../../api/variables";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";

export function VariablesPage() {
  const [hardwareModelList, setHardwareModelList] = useState<HardwareModel[]>([]);
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<number | "">("");
  const [selectedHardwareModelId, setSelectedHardwareModelId] = useState<number | "">("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newRegister, setNewRegister] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [editingVariableId, setEditingVariableId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUnit, setEditingUnit] = useState("");
  const [editingRegister, setEditingRegister] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    listHardwareModels()
      .then(({ hardwareModels }) => setHardwareModelList(hardwareModels))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  // Supports deep-linking here (e.g. from Type des données > Matériel's "Variables" column) via
  // /data-types/variables?hardwareModelId=<id>, preselecting that model once the list has
  // loaded, then stripping the query param so it doesn't reopen on refresh.
  useEffect(() => {
    const id = Number(searchParams.get("hardwareModelId"));
    if (!id || !hardwareModelList.some((m) => m.id === id)) return;
    setDeviceTypeFilter("");
    setSelectedHardwareModelId(id);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareModelList, searchParams, setSearchParams]);

  const selectedHardwareModel = useMemo(
    () => hardwareModelList.find((m) => m.id === selectedHardwareModelId) ?? null,
    [hardwareModelList, selectedHardwareModelId]
  );

  const deviceTypeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of hardwareModelList) {
      map.set(m.deviceTypeId, m.deviceType);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [hardwareModelList]);

  const filteredHardwareModelList = useMemo(() => {
    if (deviceTypeFilter === "") return hardwareModelList;
    return hardwareModelList.filter((m) => m.deviceTypeId === deviceTypeFilter);
  }, [hardwareModelList, deviceTypeFilter]);

  function handleDeviceTypeFilterChange(value: string) {
    const deviceTypeId = value ? Number(value) : "";
    setDeviceTypeFilter(deviceTypeId);
    if (deviceTypeId !== "" && selectedHardwareModel && selectedHardwareModel.deviceTypeId !== deviceTypeId) {
      setSelectedHardwareModelId("");
    }
  }

  async function loadVariables() {
    if (!selectedHardwareModel) return;
    try {
      const { variables: all } = await listVariables();
      setVariables(all.filter((v) => v.hardwareModelId === selectedHardwareModel.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    }
  }

  useEffect(() => {
    setEditingVariableId(null);
    setNewName("");
    setNewUnit("");
    setNewRegister("");
    setAddError(null);
    if (!selectedHardwareModel) {
      setVariables([]);
      return;
    }
    loadVariables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHardwareModel]);

  async function handleAddVariable(e: FormEvent) {
    e.preventDefault();
    if (!selectedHardwareModel) return;
    setAddError(null);
    setAddSubmitting(true);
    try {
      await createVariable({
        hardwareModelId: selectedHardwareModel.id,
        name: newName,
        unit: newUnit,
        register: newRegister,
      });
      setNewName("");
      setNewUnit("");
      setNewRegister("");
      await loadVariables();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Erreur lors de l'ajout.");
    } finally {
      setAddSubmitting(false);
    }
  }

  function startEdit(variable: Variable) {
    setEditingVariableId(variable.id);
    setEditingName(variable.name);
    setEditingUnit(variable.unit);
    setEditingRegister(variable.register);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingVariableId(null);
  }

  async function handleSaveEdit(variable: Variable) {
    const name = editingName.trim();
    const register = editingRegister.trim();
    if (!name || !register) return;
    setEditError(null);
    try {
      const { variable: updated } = await updateVariable(variable.id, {
        hardwareModelId: variable.hardwareModelId,
        name,
        unit: editingUnit.trim(),
        register,
      });
      setVariables((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setEditingVariableId(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Erreur lors de la modification.");
    }
  }

  async function handleDeleteVariable(variableId: number) {
    if (!window.confirm("Supprimer cette variable ?")) return;
    try {
      await deleteVariable(variableId);
      setVariables((prev) => prev.filter((v) => v.id !== variableId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Variables</h2>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <label>
          Type de matériel
          <select value={deviceTypeFilter} onChange={(e) => handleDeviceTypeFilterChange(e.target.value)}>
            <option value="">Tous les types</option>
            {deviceTypeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Matériel
          <select
            value={selectedHardwareModelId}
            onChange={(e) => setSelectedHardwareModelId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Sélectionner...</option>
            {filteredHardwareModelList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.brandName} — {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedHardwareModel && (
        <div className="ports-designer-list">
          <h3>Variables du modèle</h3>
          <form className="inline-form" onSubmit={handleAddVariable}>
            <label>
              Nom
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </label>
            <label>
              Unité
              <input type="text" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
            </label>
            <label>
              Registre
              <input type="text" value={newRegister} onChange={(e) => setNewRegister(e.target.value)} required />
            </label>
            <button type="submit" disabled={addSubmitting}>
              Ajouter
            </button>
          </form>
          {addError && <p className="error">{addError}</p>}
          {editError && <p className="error">{editError}</p>}
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Unité</th>
                <th>Registre</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v) => (
                <tr key={v.id}>
                  {editingVariableId === v.id ? (
                    <>
                      <td>
                        <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
                      </td>
                      <td>
                        <input type="text" value={editingUnit} onChange={(e) => setEditingUnit(e.target.value)} />
                      </td>
                      <td>
                        <input type="text" value={editingRegister} onChange={(e) => setEditingRegister(e.target.value)} />
                      </td>
                      <td className="table-actions">
                        <button type="button" className="link" onClick={() => handleSaveEdit(v)}>
                          Enregistrer
                        </button>
                        <button type="button" className="link" onClick={cancelEdit}>
                          Annuler
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{v.name}</td>
                      <td>{v.unit || "—"}</td>
                      <td>{v.register}</td>
                      <td className="table-actions">
                        <button type="button" className="link" onClick={() => startEdit(v)}>
                          Modifier
                        </button>
                        <button className="danger" onClick={() => handleDeleteVariable(v.id)}>
                          Supprimer
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {variables.length === 0 && <p className="muted">Aucune variable définie pour ce modèle.</p>}
        </div>
      )}
    </div>
  );
}
