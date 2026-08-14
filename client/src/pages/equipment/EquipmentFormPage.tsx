import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createEquipment, getEquipment, updateEquipment } from "../../api/equipment";
import { listRooms } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";

export function EquipmentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [hardwareModels, setHardwareModels] = useState<HardwareModel[]>([]);
  const [roomId, setRoomId] = useState<number | "">("");
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [hardwareModelId, setHardwareModelId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ rooms: r }, { deviceTypes: dt }, { hardwareModels: hm }] = await Promise.all([
        listRooms(),
        listDeviceTypes(),
        listHardwareModels(),
      ]);
      setRooms(r);
      setDeviceTypes(dt);
      setHardwareModels(hm);
      if (isEdit) {
        const { equipment } = await getEquipment(Number(id));
        setRoomId(equipment.roomId);
        setDeviceTypeId(equipment.deviceTypeId);
        setHardwareModelId(equipment.hardwareModelId);
        setName(equipment.name);
      } else {
        if (r.length > 0) setRoomId(r[0].id);
        if (dt.length > 0) setDeviceTypeId(dt[0].id);
        if (hm.length > 0) setHardwareModelId(hm[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [id, isEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (roomId === "" || deviceTypeId === "" || hardwareModelId === "") return;
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
      <h1>{isEdit ? "Modifier le matériel" : "Ajouter du matériel"}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Nom
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Salle
          <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))} required>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.siteName} / {room.zoneName} / {room.name}
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
          <button type="button" className="btn-outline" onClick={() => navigate("/equipment")}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
