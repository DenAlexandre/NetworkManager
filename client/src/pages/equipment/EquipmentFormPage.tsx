import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createEquipment, getEquipment, updateEquipment } from "../../api/equipment";
import { listManufacturers } from "../../api/manufacturers";
import type { Manufacturer } from "../../api/manufacturers";
import { ApiError } from "../../api/client";

export function EquipmentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [name, setName] = useState("");
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [manufacturerId, setManufacturerId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const deviceTypeOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const m of manufacturers) {
      if (!seen.has(m.deviceTypeId)) seen.set(m.deviceTypeId, m.deviceType);
    }
    return [...seen.entries()]
      .map(([typeId, name]) => ({ id: typeId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [manufacturers]);

  const filteredManufacturers = useMemo(
    () => manufacturers.filter((m) => m.deviceTypeId === deviceTypeId),
    [manufacturers, deviceTypeId]
  );

  useEffect(() => {
    async function load() {
      const { manufacturers: list } = await listManufacturers();
      setManufacturers(list);
      if (isEdit) {
        const { equipment } = await getEquipment(Number(id));
        setName(equipment.name);
        const current = list.find((m) => m.id === equipment.manufacturerId);
        setDeviceTypeId(current ? current.deviceTypeId : "");
        setManufacturerId(equipment.manufacturerId);
      } else if (list.length > 0) {
        setDeviceTypeId(list[0].deviceTypeId);
        setManufacturerId(list[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [id, isEdit]);

  function handleDeviceTypeChange(newDeviceTypeId: number) {
    setDeviceTypeId(newDeviceTypeId);
    const firstMatch = manufacturers.find((m) => m.deviceTypeId === newDeviceTypeId);
    setManufacturerId(firstMatch ? firstMatch.id : "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (manufacturerId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = { name, manufacturerId: Number(manufacturerId) };
      if (isEdit) {
        await updateEquipment(Number(id), input);
      } else {
        await createEquipment(input);
      }
      navigate("/equipment");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier le matériel" : "Ajouter un matériel"}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Nom
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Type de matériel
          <select
            value={deviceTypeId}
            onChange={(e) => handleDeviceTypeChange(Number(e.target.value))}
            required
          >
            {deviceTypeOptions.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Constructeur
          <select
            value={manufacturerId}
            onChange={(e) => setManufacturerId(Number(e.target.value))}
            required
          >
            {filteredManufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.manufacturer}
                {m.reference ? ` — ${m.reference}` : ""}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            Enregistrer
          </button>
          <button type="button" className="btn-outline" onClick={() => navigate("/equipment")}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
