import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createEquipment, getEquipment, updateEquipment } from "../../api/equipment";
import { listRooms } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { listDeviceTypes } from "../../api/deviceTypes";
import type { DeviceType } from "../../api/deviceTypes";
import { listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { listApis } from "../../api/apis";
import type { Api } from "../../api/apis";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface EquipmentFormModalProps {
  equipmentId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

function sortRooms(rooms: Room[]) {
  return [...rooms].sort(
    (a, b) => a.siteName.localeCompare(b.siteName) || a.zoneName.localeCompare(b.zoneName) || a.name.localeCompare(b.name)
  );
}

export function EquipmentFormModal({ equipmentId, onClose, onSaved }: EquipmentFormModalProps) {
  const isEdit = equipmentId !== null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [hardwareModels, setHardwareModels] = useState<HardwareModel[]>([]);
  const [apis, setApis] = useState<Api[]>([]);
  const [roomId, setRoomId] = useState<number | "">("");
  const [deviceTypeId, setDeviceTypeId] = useState<number | "">("");
  const [hardwareModelId, setHardwareModelId] = useState<number | "">("");
  const [apiId, setApiId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [isApiStartPoint, setIsApiStartPoint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ rooms: roomsRes }, { deviceTypes: dt }, { hardwareModels: hm }, { apis: apiList }] = await Promise.all([
        listRooms(),
        listDeviceTypes(),
        listHardwareModels(),
        listApis(),
      ]);
      const r = sortRooms(roomsRes);
      setRooms(r);
      setDeviceTypes(dt);
      setHardwareModels(hm);
      setApis(apiList);
      if (isEdit) {
        const { equipment } = await getEquipment(Number(equipmentId));
        setRoomId(equipment.roomId);
        setDeviceTypeId(equipment.deviceTypeId);
        setHardwareModelId(equipment.hardwareModelId);
        setApiId(equipment.apiId ?? "");
        setName(equipment.name);
        setIsApiStartPoint(equipment.isApiStartPoint);
      } else {
        if (r.length > 0) setRoomId(r[0].id);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [equipmentId, isEdit]);

  // Keeps the currently assigned hardware model visible even if it doesn't match the equipment's
  // device type (can happen with legacy data — e.g. duplicate device types differing only by
  // case), so the select never silently renders blank for an already-saved value.
  const filteredHardwareModels = useMemo(() => {
    const filtered = deviceTypeId === "" ? hardwareModels : hardwareModels.filter((hm) => hm.deviceTypeId === deviceTypeId);
    if (hardwareModelId !== "" && !filtered.some((hm) => hm.id === hardwareModelId)) {
      const current = hardwareModels.find((hm) => hm.id === hardwareModelId);
      if (current) return [current, ...filtered];
    }
    return filtered;
  }, [hardwareModels, deviceTypeId, hardwareModelId]);

  function handleDeviceTypeChange(value: number | "") {
    setDeviceTypeId(value);
    setHardwareModelId((prev) => {
      if (prev === "") return prev;
      const stillValid = hardwareModels.some((hm) => hm.id === prev && (value === "" || hm.deviceTypeId === value));
      return stillValid ? prev : "";
    });
  }

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
        apiId: apiId === "" ? null : Number(apiId),
        name,
        isApiStartPoint,
      };
      if (isEdit) {
        await updateEquipment(Number(equipmentId), input);
      } else {
        await createEquipment(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier le matériel" : "Ajouter du matériel"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
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
            <select
              value={deviceTypeId}
              onChange={(e) => handleDeviceTypeChange(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">-</option>
              {deviceTypes.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Matériel (catalogue)
            <select
              value={hardwareModelId}
              onChange={(e) => setHardwareModelId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">-</option>
              {filteredHardwareModels.map((hm) => (
                <option key={hm.id} value={hm.id}>
                  {hm.brandName} — {hm.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            API liée
            <select value={apiId} onChange={(e) => setApiId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— Aucune —</option>
              {apis.map((api) => (
                <option key={api.id} value={api.id}>
                  {api.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={isApiStartPoint} onChange={(e) => setIsApiStartPoint(e.target.checked)} />
            Point de départ API
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              Enregistrer
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
