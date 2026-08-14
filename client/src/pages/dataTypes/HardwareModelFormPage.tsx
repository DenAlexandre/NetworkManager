import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createHardwareModel,
  getHardwareModel,
  updateHardwareModel,
} from "../../api/hardwareModels";
import { listBrands } from "../../api/brands";
import type { Brand } from "../../api/brands";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { bulkCreatePorts, deletePort, listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import { listLinkTypes } from "../../api/linkTypes";
import type { LinkType } from "../../api/linkTypes";
import { ApiError } from "../../api/client";

export function HardwareModelFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<number | "">("");
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [ports, setPorts] = useState<Port[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [bulkLinkTypeId, setBulkLinkTypeId] = useState<number | "">("");
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ brands: list }, { deviceTypes: dtList }] = await Promise.all([listBrands(), listDeviceTypes()]);
      setBrands(list);
      setDeviceTypes(dtList);
      if (isEdit) {
        const { hardwareModel } = await getHardwareModel(Number(id));
        setBrandId(hardwareModel.brandId);
        setDeviceTypeId(hardwareModel.deviceTypeId);
        setName(hardwareModel.name);
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
  }, [id, isEdit]);

  async function loadPorts() {
    const { ports: all } = await listPorts();
    setPorts(all.filter((p) => p.hardwareModelId === Number(id)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (brandId === "" || deviceTypeId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = { brandId: Number(brandId), deviceTypeId: Number(deviceTypeId), name };
      if (isEdit) {
        await updateHardwareModel(Number(id), input);
      } else {
        await createHardwareModel(input);
      }
      navigate("/data-types/hardware-models");
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
        hardwareModelId: Number(id),
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

  async function handleDeletePort(portId: number) {
    if (!window.confirm("Supprimer ce port ?")) return;
    try {
      await deletePort(portId);
      setPorts((prev) => prev.filter((p) => p.id !== portId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <div className="form-page">
        <h1>{isEdit ? "Modifier le matériel" : "Ajouter un matériel"}</h1>
        <form onSubmit={handleSubmit}>
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
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              Enregistrer
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => navigate("/data-types/hardware-models")}
            >
              Annuler
            </button>
          </div>
        </form>
      </div>

      {isEdit && (
        <div className="card">
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
                  <td>{p.label}</td>
                  <td className="table-actions">
                    <button className="danger" onClick={() => handleDeletePort(p.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ports.length === 0 && <p className="muted">Aucun port configuré.</p>}
        </div>
      )}
    </div>
  );
}
