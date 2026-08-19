import { useEffect, useMemo, useState } from "react";
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

function portKey(equipmentId: number, portId: number) {
  return `${equipmentId}:${portId}`;
}

export function EquipmentLinkFormModal({ linkId, onClose, onSaved }: EquipmentLinkFormModalProps) {
  const isEdit = linkId !== null;

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  // Keyed by "equipmentId:portId", not just portId — a hardware_model_ports row is a catalog
  // definition shared by every equipment instance of that model, so two different pieces of
  // equipment using the same model reuse the same port ids. Tracking "used" by port id alone
  // would mark a port unavailable for an instance that has never actually used it, just because
  // some other instance of the same model happens to have.
  const [usedPortKeys, setUsedPortKeys] = useState<Set<string>>(new Set());
  const [parentEquipmentId, setParentEquipmentId] = useState<number | "">("");
  const [parentPortId, setParentPortId] = useState<number | "">("");
  const [childEquipmentId, setChildEquipmentId] = useState<number | "">("");
  const [childPortId, setChildPortId] = useState<number | "">("");
  const [parentSearch, setParentSearch] = useState("");
  const [childSearch, setChildSearch] = useState("");
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
      const used = new Set<string>();
      for (const link of allLinks) {
        used.add(portKey(link.parentEquipmentId, link.parentPortId));
        used.add(portKey(link.childEquipmentId, link.childPortId));
      }
      setUsedPortKeys(used);
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
  // side of the link is currently using) even though it's marked "used", without leaking the
  // *other* side's port into this dropdown when both sides share a hardware model.
  function availablePortsFor(equipmentId: number | "", currentPortId: number | "") {
    if (equipmentId === "") return [];
    const item = equipment.find((e) => e.id === equipmentId);
    if (!item) return [];
    return ports.filter(
      (p) =>
        p.hardwareModelId === item.hardwareModelId &&
        (p.id === currentPortId || !usedPortKeys.has(portKey(equipmentId, p.id)))
    );
  }

  const parentPortOptions = availablePortsFor(parentEquipmentId, parentPortId);
  const childPortOptions = availablePortsFor(childEquipmentId, childPortId);

  // Narrows the (potentially long) equipment list down to matches on name/site/zone/room, but
  // always keeps the currently selected equipment in the list even if it no longer matches the
  // search text, so typing after picking a value never silently clears the visible selection.
  function filterEquipmentOptions(search: string, selectedId: number | "") {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? equipment.filter((eq) =>
          `${eq.name} ${eq.siteName} ${eq.zoneName} ${eq.roomName}`.toLowerCase().includes(query)
        )
      : equipment;
    if (selectedId !== "" && !filtered.some((eq) => eq.id === selectedId)) {
      const selected = equipment.find((eq) => eq.id === selectedId);
      if (selected) return [selected, ...filtered];
    }
    return filtered;
  }

  const parentEquipmentOptions = useMemo(
    () => filterEquipmentOptions(parentSearch, parentEquipmentId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equipment, parentSearch, parentEquipmentId]
  );
  const childEquipmentOptions = useMemo(
    () => filterEquipmentOptions(childSearch, childEquipmentId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equipment, childSearch, childEquipmentId]
  );

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
            <input
              type="text"
              placeholder="Rechercher..."
              value={parentSearch}
              onChange={(e) => setParentSearch(e.target.value)}
            />
            <select
              value={parentEquipmentId}
              onChange={(e) => {
                setParentEquipmentId(e.target.value ? Number(e.target.value) : "");
                setParentPortId("");
              }}
              required
            >
              <option value="">—</option>
              {parentEquipmentOptions.map((eq) => (
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
            <input
              type="text"
              placeholder="Rechercher..."
              value={childSearch}
              onChange={(e) => setChildSearch(e.target.value)}
            />
            <select
              value={childEquipmentId}
              onChange={(e) => {
                setChildEquipmentId(e.target.value ? Number(e.target.value) : "");
                setChildPortId("");
              }}
              required
            >
              <option value="">—</option>
              {childEquipmentOptions.map((eq) => (
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
