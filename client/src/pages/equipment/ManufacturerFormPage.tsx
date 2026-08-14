import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createManufacturer,
  getManufacturer,
  updateManufacturer,
} from "../../api/manufacturers";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { listBrands } from "../../api/brands";
import type { Brand } from "../../api/brands";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";

const EMPTY_FORM = {
  docPath: "",
  ioType: "",
};

export function ManufacturerFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [hardwareModels, setHardwareModels] = useState<HardwareModel[]>([]);
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [brandId, setBrandId] = useState<number | "">("");
  const [hardwareModelId, setHardwareModelId] = useState<number | "">("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const filteredHardwareModels = useMemo(
    () => hardwareModels.filter((hm) => hm.brandId === brandId),
    [hardwareModels, brandId]
  );

  useEffect(() => {
    async function load() {
      const [{ deviceTypes: dtList }, { brands: brandList }, { hardwareModels: hmList }] = await Promise.all([
        listDeviceTypes(),
        listBrands(),
        listHardwareModels(),
      ]);
      setDeviceTypes(dtList);
      setBrands(brandList);
      setHardwareModels(hmList);
      if (isEdit) {
        const { manufacturer } = await getManufacturer(Number(id));
        setDeviceTypeId(manufacturer.deviceTypeId);
        setBrandId(manufacturer.brandId);
        setHardwareModelId(manufacturer.hardwareModelId ?? "");
        setForm({
          docPath: manufacturer.docPath || "",
          ioType: manufacturer.ioType || "",
        });
      } else {
        if (dtList.length > 0) setDeviceTypeId(dtList[0].id);
        if (brandList.length > 0) setBrandId(brandList[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [id, isEdit]);

  function handleBrandChange(newBrandId: number) {
    setBrandId(newBrandId);
    setHardwareModelId("");
  }

  function update(field: keyof typeof EMPTY_FORM) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (deviceTypeId === "" || brandId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        ...form,
        deviceTypeId: Number(deviceTypeId),
        brandId: Number(brandId),
        hardwareModelId: hardwareModelId === "" ? null : Number(hardwareModelId),
      };
      if (isEdit) {
        await updateManufacturer(Number(id), input);
      } else {
        await createManufacturer(input);
      }
      navigate("/equipment/manufacturers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier le constructeur" : "Ajouter un constructeur"}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Type
          <select
            value={deviceTypeId}
            onChange={(e) => setDeviceTypeId(Number(e.target.value))}
            required
          >
            {deviceTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Constructeur
          <select value={brandId} onChange={(e) => handleBrandChange(Number(e.target.value))} required>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Matériel
          <select value={hardwareModelId} onChange={(e) => setHardwareModelId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— Aucun —</option>
            {filteredHardwareModels.map((hm) => (
              <option key={hm.id} value={hm.id}>
                {hm.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Doc technique
          <input type="text" value={form.docPath} onChange={update("docPath")} />
        </label>
        <label>
          Type entrée/sortie
          <input type="text" value={form.ioType} onChange={update("ioType")} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            Enregistrer
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate("/equipment/manufacturers")}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
