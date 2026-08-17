import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  createHardwareModel,
  deleteHardwareModelImage,
  getHardwareModel,
  hardwareModelImageUrl,
  updateHardwareModel,
  uploadHardwareModelImage,
} from "../../api/hardwareModels";
import { listBrands } from "../../api/brands";
import type { Brand } from "../../api/brands";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { bulkCreatePorts, deletePort, listPorts, updatePort } from "../../api/ports";
import type { Port } from "../../api/ports";
import { listLinkTypes } from "../../api/linkTypes";
import type { LinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface HardwareModelFormModalProps {
  hardwareModelId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function HardwareModelFormModal({ hardwareModelId, onClose, onSaved }: HardwareModelFormModalProps) {
  const isEdit = hardwareModelId !== null;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<number | "">("");
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const [ports, setPorts] = useState<Port[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [bulkLinkTypeId, setBulkLinkTypeId] = useState<number | "">("");
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [editingPortId, setEditingPortId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editLabelError, setEditLabelError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ brands: list }, { deviceTypes: dtList }] = await Promise.all([listBrands(), listDeviceTypes()]);
      setBrands(list);
      setDeviceTypes(dtList);
      if (isEdit) {
        const { hardwareModel } = await getHardwareModel(Number(hardwareModelId));
        setBrandId(hardwareModel.brandId);
        setDeviceTypeId(hardwareModel.deviceTypeId);
        setName(hardwareModel.name);
        setImagePath(hardwareModel.imagePath);
        await loadPorts();
        const { linkTypes: ltList } = await listLinkTypes();
        setLinkTypes(ltList);
        if (ltList.length > 0) setBulkLinkTypeId(ltList[0].id);
      } else {
        if (list.length > 0) setBrandId(list[0].id);
        if (dtList.length > 0) setDeviceTypeId(dtList[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [hardwareModelId, isEdit]);

  async function loadPorts() {
    const { ports: all } = await listPorts();
    setPorts(all.filter((p) => p.hardwareModelId === Number(hardwareModelId)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (brandId === "" || deviceTypeId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = { brandId: Number(brandId), deviceTypeId: Number(deviceTypeId), name };
      if (isEdit) {
        await updateHardwareModel(Number(hardwareModelId), input);
      } else {
        await createHardwareModel(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGeneratePorts(e: FormEvent) {
    e.preventDefault();
    if (bulkLinkTypeId === "") return;
    setBulkError(null);
    setBulkSubmitting(true);
    try {
      await bulkCreatePorts({
        hardwareModelId: Number(hardwareModelId),
        linkTypeId: Number(bulkLinkTypeId),
        quantity: bulkQuantity,
      });
      await loadPorts();
    } catch (err) {
      setBulkError(err instanceof ApiError ? err.message : "Erreur lors de la génération.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function uploadImageFile(file: File) {
    setImageError(null);
    setImageUploading(true);
    try {
      const { hardwareModel } = await uploadHardwareModelImage(Number(hardwareModelId), file);
      setImagePath(hardwareModel.imagePath);
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : "Erreur lors du téléversement.");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    await uploadImageFile(file);
  }

  useEffect(() => {
    if (!isEdit) return;
    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      uploadImageFile(file);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isEdit, hardwareModelId]);

  async function handleRemoveImage() {
    if (!window.confirm("Supprimer cette image ?")) return;
    setImageError(null);
    try {
      const { hardwareModel } = await deleteHardwareModelImage(Number(hardwareModelId));
      setImagePath(hardwareModel.imagePath);
    } catch (err) {
      setImageError(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function startEditLabel(port: Port) {
    setEditingPortId(port.id);
    setEditingLabel(port.label);
    setEditLabelError(null);
  }

  function cancelEditLabel() {
    setEditingPortId(null);
  }

  async function handleSaveLabel(port: Port) {
    const label = editingLabel.trim();
    if (!label) return;
    setEditLabelError(null);
    try {
      const { port: updated } = await updatePort(port.id, {
        hardwareModelId: port.hardwareModelId,
        linkTypeId: port.linkTypeId,
        label,
      });
      setPorts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingPortId(null);
    } catch (err) {
      setEditLabelError(err instanceof ApiError ? err.message : "Erreur lors de la modification.");
    }
  }

  async function handleDeletePort(portId: number) {
    if (!window.confirm("Supprimer ce port ?")) return;
    try {
      await deletePort(portId);
      setPorts((prev) => prev.filter((p) => p.id !== portId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  return (
    <Modal title={isEdit ? "Modifier le matériel" : "Ajouter un matériel"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          <form id="hardware-model-form" onSubmit={handleSubmit}>
            <label>
              Constructeur
              <select value={brandId} onChange={(e) => setBrandId(Number(e.target.value))} required>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type de matériel
              <select value={deviceTypeId} onChange={(e) => setDeviceTypeId(Number(e.target.value))} required>
                {deviceTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>
                    {dt.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nom
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          </form>

          {isEdit && (
            <div className="card card-compact-top">
              <h2>Image</h2>
              {imagePath && (
                <div className="hardware-model-image-preview">
                  <img src={hardwareModelImageUrl(imagePath)} alt={name} />
                </div>
              )}
              <div className="inline-form">
                <label>
                  {imagePath ? "Remplacer l'image" : "Ajouter une image"}
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleImageChange} disabled={imageUploading} />
                </label>
                {imagePath && (
                  <button type="button" className="danger" onClick={handleRemoveImage}>
                    Supprimer l'image
                  </button>
                )}
              </div>
              <p className="muted">Vous pouvez aussi coller une image copiée (Ctrl+V).</p>
              {imageError && <p className="error">{imageError}</p>}
            </div>
          )}

          {isEdit && (
            <div className="card card-compact-top">
              <h2>Ports</h2>
              <form className="inline-form" onSubmit={handleGeneratePorts}>
                <label>
                  Type de liaison
                  <select
                    value={bulkLinkTypeId}
                    onChange={(e) => setBulkLinkTypeId(Number(e.target.value))}
                    required
                  >
                    {linkTypes.map((lt) => (
                      <option key={lt.id} value={lt.id}>
                        {lt.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantité
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={bulkQuantity}
                    onChange={(e) => setBulkQuantity(Number(e.target.value))}
                    required
                  />
                </label>
                <button type="submit" disabled={bulkSubmitting}>
                  Générer
                </button>
              </form>
              {bulkError && <p className="error">{bulkError}</p>}
              {editLabelError && <p className="error">{editLabelError}</p>}
              <table className="table">
                <thead>
                  <tr>
                    <th>Type de liaison</th>
                    <th>Label</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p) => (
                    <tr key={p.id}>
                      <td>{p.portType}</td>
                      <td>
                        {editingPortId === p.id ? (
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveLabel(p);
                              } else if (e.key === "Escape") {
                                cancelEditLabel();
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          p.label
                        )}
                      </td>
                      <td className="table-actions">
                        {editingPortId === p.id ? (
                          <>
                            <button type="button" className="link" onClick={() => handleSaveLabel(p)}>
                              Enregistrer
                            </button>
                            <button type="button" className="link" onClick={cancelEditLabel}>
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="link" onClick={() => startEditLabel(p)}>
                              Modifier
                            </button>
                            <button className="danger" onClick={() => handleDeletePort(p.id)}>
                              Supprimer
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ports.length === 0 && <p className="muted">Aucun port configuré.</p>}
            </div>
          )}

          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" form="hardware-model-form" disabled={submitting}>
              Enregistrer
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
