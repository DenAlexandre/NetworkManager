import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createEquipment, getEquipment, updateEquipment } from "../../api/equipment";
import { getRoom } from "../../api/rooms";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";

export function EquipmentFormPage() {
  const { siteId, zoneId, roomId, equipmentId } = useParams();
  const isEdit = Boolean(equipmentId);
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [hardwareModels, setHardwareModels] = useState<HardwareModel[]>([]);
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [hardwareModelId, setHardwareModelId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ room }, { deviceTypes: dt }, { hardwareModels: hm }] = await Promise.all([
        getRoom(Number(roomId)),
        listDeviceTypes(),
        listHardwareModels(),
      ]);
      setRoomName(room.name);
      setZoneName(room.zoneName);
      setSiteName(room.siteName);
      setDeviceTypes(dt);
      setHardwareModels(hm);
      if (isEdit) {
        const { equipment } = await getEquipment(Number(equipmentId));
        setDeviceTypeId(equipment.deviceTypeId);
        setHardwareModelId(equipment.hardwareModelId);
        setName(equipment.name);
      } else {
        if (dt.length > 0) setDeviceTypeId(dt[0].id);
        if (hm.length > 0) setHardwareModelId(hm[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [roomId, equipmentId, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (deviceTypeId === "" || hardwareModelId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        roomId: Number(roomId),
        deviceTypeId: Number(deviceTypeId),
        hardwareModelId: Number(hardwareModelId),
        name,
      };
      if (isEdit) {
        await updateEquipment(Number(equipmentId), input);
      } else {
        await createEquipment(input);
      }
      navigate(`/sites/${siteId}/zones/${zoneId}/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="form-page">
      <h1>{isEdit ? "Modifier le matériel" : "Ajouter du matériel"}</h1>
      <p className="muted">
        {siteName} / {zoneName} / {roomName}
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Nom
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
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
          Matériel (catalogue)
          <select value={hardwareModelId} onChange={(e) => setHardwareModelId(Number(e.target.value))} required>
            {hardwareModels.map((hm) => (
              <option key={hm.id} value={hm.id}>
                {hm.brandName} — {hm.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            Enregistrer
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate(`/sites/${siteId}/zones/${zoneId}/rooms/${roomId}`)}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
