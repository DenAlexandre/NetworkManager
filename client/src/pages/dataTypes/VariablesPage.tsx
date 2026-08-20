import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteVariable, listVariables } from "../../api/variables";
import type { Variable } from "../../api/variables";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";
import { VariableFormModal } from "./VariableFormModal";
import { usePermission } from "../../hooks/usePermission";

export function VariablesPage() {
  const { canWrite } = usePermission("data-types");
  const [hardwareModelList, setHardwareModelList] = useState<HardwareModel[]>([]);
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<number | "">("");
  const [selectedHardwareModelId, setSelectedHardwareModelId] = useState<number | "">("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingVariableId, setEditingVariableId] = useState<number | null>(null);
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
    setModalOpen(false);
    setEditingVariableId(null);
    if (!selectedHardwareModel) {
      setVariables([]);
      return;
    }
    loadVariables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHardwareModel]);

  function openCreateModal() {
    setEditingVariableId(null);
    setModalOpen(true);
  }

  function openEditModal(variableId: number) {
    setEditingVariableId(variableId);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    loadVariables();
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
          <div className="page-header">
            <h3>Variables du modèle</h3>
            {canWrite && (
              <button type="button" className="btn" onClick={openCreateModal}>
                Ajouter
              </button>
            )}
          </div>
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
                  <td>{v.name}</td>
                  <td>{v.unit || "—"}</td>
                  <td>{v.register || "—"}</td>
                  <td className="table-actions">
                    {canWrite && (
                      <>
                        <button type="button" className="link" onClick={() => openEditModal(v.id)}>
                          Modifier
                        </button>
                        <button className="danger" onClick={() => handleDeleteVariable(v.id)}>
                          Supprimer
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {variables.length === 0 && <p className="muted">Aucune variable définie pour ce modèle.</p>}
        </div>
      )}
      {modalOpen && selectedHardwareModel && (
        <VariableFormModal
          variableId={editingVariableId}
          hardwareModelId={selectedHardwareModel.id}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
