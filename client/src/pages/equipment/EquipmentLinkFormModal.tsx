import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import { createEquipmentLink, getEquipmentLink, listEquipmentLinks, updateEquipmentLink } from "../../api/equipmentLinks";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

interface EquipmentLinkFormModalProps {
  linkId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EquipmentLinkFormModal({ linkId, onClose, onSaved }: EquipmentLinkFormModalProps) {
  const isEdit = linkId !== null;

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [usedPortIds, setUsedPortIds] = useState<Set<number>>(new Set());
  const [parentEquipmentId, setParentEquipmentId] = useState<number | "">("");
  const [parentPortId, setParentPortId] = useState<number | "">("");
  const [childEquipmentId, setChildEquipmentId] = useState<number | "">("");
  const [childPortId, setChildPortId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ equipment: eq }, { ports: allPorts }, { links: allLinks }] = await Promise.all([
        listEquipment(),
        listPorts(),
        listEquipmentLinks(),
      ]);
      setEquipment(eq);
      setPorts(allPorts);
      const used = new Set<number>();
      for (const link of allLinks) {
        used.add(link.parentPortId);
        used.add(link.childPortId);
      }
      setUsedPortIds(used);
      if (isEdit) {
        const { link } = await getEquipmentLink(Number(linkId));
        setParentEquipmentId(link.parentEquipmentId);
        setParentPortId(link.parentPortId);
        setChildEquipmentId(link.childEquipmentId);
        setChildPortId(link.childPortId);
      }
      setLoading(false);
    }
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      setLoading(false);
    });
  }, [linkId, isEdit]);

  // currentPortId re-allows this dropdown's own already-assigned port (the one this specific
  // side of the link is currently using) even though it's marked "used" globally, without
  // leaking the *other* side's port into this dropdown when both sides share a hardware model.
  function availablePortsFor(equipmentId: number | "", currentPortId: number | "") {
    if (equipmentId === "") return [];
    const item = equipment.find((e) => e.id === equipmentId);
    if (!item) return [];
    return ports.filter(
      (p) => p.hardwareModelId === item.hardwareModelId && (p.id === currentPortId || !usedPortIds.has(p.id))
    );
  }

  const parentPortOptions = availablePortsFor(parentEquipmentId, parentPortId);
  const childPortOptions = availablePortsFor(childEquipmentId, childPortId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (parentEquipmentId === "" || parentPortId === "" || childEquipmentId === "" || childPortId === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const input = {
        parentEquipmentId: Number(parentEquipmentId),
        parentPortId: Number(parentPortId),
        childEquipmentId: Number(childEquipmentId),
        childPortId: Number(childPortId),
      };
      if (isEdit) {
        await updateEquipmentLink(Number(linkId), input);
      } else {
        await createEquipmentLink(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "Modifier la liaison" : "Ajouter une liaison"} onClose={onClose}>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Matériel parent
            <select
              value={parentEquipmentId}
              onChange={(e) => {
                setParentEquipmentId(e.target.value ? Number(e.target.value) : "");
                setParentPortId("");
              }}
              required
            >
              <option value="">—</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} ({eq.zoneName} / {eq.roomName})
                </option>
              ))}
            </select>
          </label>
          <label>
            Port parent
            <select
              value={parentPortId}
              onChange={(e) => setParentPortId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">—</option>
              {parentPortOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Matériel enfant
            <select
              value={childEquipmentId}
              onChange={(e) => {
                setChildEquipmentId(e.target.value ? Number(e.target.value) : "");
                setChildPortId("");
              }}
              required
            >
              <option value="">—</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} ({eq.zoneName} / {eq.roomName})
                </option>
              ))}
            </select>
          </label>
          <label>
            Port enfant
            <select
              value={childPortId}
              onChange={(e) => setChildPortId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">—</option>
              {childPortOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
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
