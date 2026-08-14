import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import { createEquipmentLink, deleteEquipmentLink, listEquipmentLinks } from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";
import { ApiError } from "../../api/client";

export function EquipmentLinksPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [parentEquipmentId, setParentEquipmentId] = useState<number | "">("");
  const [parentPortId, setParentPortId] = useState<number | "">("");
  const [childEquipmentId, setChildEquipmentId] = useState<number | "">("");
  const [childPortId, setChildPortId] = useState<number | "">("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ equipment: eq }, { ports: allPorts }, { links: allLinks }] = await Promise.all([
        listEquipment(),
        listPorts(),
        listEquipmentLinks(),
      ]);
      setEquipment(eq);
      setPorts(allPorts);
      setLinks(allLinks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  const usedPortIds = useMemo(() => {
    const used = new Set<number>();
    for (const link of links) {
      used.add(link.parentPortId);
      used.add(link.childPortId);
    }
    return used;
  }, [links]);

  function availablePortsFor(equipmentId: number | "") {
    if (equipmentId === "") return [];
    const item = equipment.find((e) => e.id === equipmentId);
    if (!item) return [];
    return ports.filter((p) => p.hardwareModelId === item.hardwareModelId && !usedPortIds.has(p.id));
  }

  const parentPortOptions = availablePortsFor(parentEquipmentId);
  const childPortOptions = availablePortsFor(childEquipmentId);

  async function handleDeleteLink(id: number) {
    if (!window.confirm("Supprimer cette liaison ?")) return;
    try {
      await deleteEquipmentLink(id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleCreateLink(e: FormEvent) {
    e.preventDefault();
    if (parentEquipmentId === "" || parentPortId === "" || childEquipmentId === "" || childPortId === "") return;
    setLinkError(null);
    setLinkSubmitting(true);
    try {
      await createEquipmentLink({
        parentEquipmentId: Number(parentEquipmentId),
        parentPortId: Number(parentPortId),
        childEquipmentId: Number(childEquipmentId),
        childPortId: Number(childPortId),
      });
      setParentEquipmentId("");
      setParentPortId("");
      setChildEquipmentId("");
      setChildPortId("");
      await load();
    } catch (err) {
      setLinkError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setLinkSubmitting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <h2>Liaisons</h2>
      <p className="muted">Le matériel peut être relié à du matériel d'autres salles.</p>
      <form className="inline-form" onSubmit={handleCreateLink}>
        <label>
          Matériel parent
          <select
            value={parentEquipmentId}
            onChange={(e) => {
              setParentEquipmentId(Number(e.target.value));
              setParentPortId("");
            }}
            required
          >
            <option value="">—</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.siteName} / {e.zoneName} / {e.roomName})
              </option>
            ))}
          </select>
        </label>
        <label>
          Port parent
          <select value={parentPortId} onChange={(e) => setParentPortId(Number(e.target.value))} required>
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
              setChildEquipmentId(Number(e.target.value));
              setChildPortId("");
            }}
            required
          >
            <option value="">—</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.siteName} / {e.zoneName} / {e.roomName})
              </option>
            ))}
          </select>
        </label>
        <label>
          Port enfant
          <select value={childPortId} onChange={(e) => setChildPortId(Number(e.target.value))} required>
            <option value="">—</option>
            {childPortOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={linkSubmitting}>
          Relier
        </button>
      </form>
      {linkError && <p className="error">{linkError}</p>}
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Parent</th>
            <th>Port parent</th>
            <th>Enfant</th>
            <th>Port enfant</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id}>
              <td>{link.parentEquipmentName}</td>
              <td>{link.parentPortLabel}</td>
              <td>{link.childEquipmentName}</td>
              <td>{link.childPortLabel}</td>
              <td className="table-actions">
                <button className="danger" onClick={() => handleDeleteLink(link.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {links.length === 0 && <p className="muted">Aucune liaison enregistrée.</p>}
    </div>
  );
}
