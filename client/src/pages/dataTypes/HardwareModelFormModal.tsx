import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  createHardwareModel,
  deleteHardwareModelDatasheet,
  deleteHardwareModelImage,
  getHardwareModel,
  hardwareModelImageUrl,
  updateHardwareModel,
  uploadHardwareModelDatasheet,
  uploadHardwareModelImage,
} from "../../api/hardwareModels";
import { listBrands } from "../../api/brands";
import type { Brand } from "../../api/brands";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
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

  const [datasheetPath, setDatasheetPath] = useState<string | null>(null);
  const [datasheetError, setDatasheetError] = useState<string | null>(null);
  const [datasheetUploading, setDatasheetUploading] = useState(false);

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
        setDatasheetPath(hardwareModel.datasheetPath);
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

  async function handleDatasheetChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setDatasheetError(null);
    setDatasheetUploading(true);
    try {
      const { hardwareModel } = await uploadHardwareModelDatasheet(Number(hardwareModelId), file);
      setDatasheetPath(hardwareModel.datasheetPath);
    } catch (err) {
      setDatasheetError(err instanceof ApiError ? err.message : "Erreur lors du téléversement.");
    } finally {
      setDatasheetUploading(false);
    }
  }

  async function handleRemoveDatasheet() {
    if (!window.confirm("Supprimer ce PDF ?")) return;
    setDatasheetError(null);
    try {
      const { hardwareModel } = await deleteHardwareModelDatasheet(Number(hardwareModelId));
      setDatasheetPath(hardwareModel.datasheetPath);
    } catch (err) {
      setDatasheetError(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
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
              <h2>Documentation constructeur</h2>
              <div className="inline-form">
                <label>
                  {datasheetPath ? "Remplacer le PDF" : "Ajouter un PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleDatasheetChange}
                    disabled={datasheetUploading}
                  />
                </label>
                {datasheetPath && (
                  <button type="button" className="danger" onClick={handleRemoveDatasheet}>
                    Supprimer le PDF
                  </button>
                )}
              </div>
              {datasheetError && <p className="error">{datasheetError}</p>}
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
