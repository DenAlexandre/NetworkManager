import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { getRoom } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { deleteEquipment, listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import {
  createEquipmentLink,
  deleteEquipmentLink,
  listEquipmentLinks,
} from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";
import { ApiError } from "../../api/client";

export function RoomDetailPage() {
  const { siteId, zoneId, roomId } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [roomEquipment, setRoomEquipment] = useState<Equipment[]>([]);
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
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
  }, [roomId]);

  async function load() {
    setLoading(true);
    try {
      const [{ room: r }, { equipment: roomEq }, { equipment: allEq }, { ports: allPorts }, { links: allLinks }] =
        await Promise.all([
          getRoom(Number(roomId)),
          listEquipment(Number(roomId)),
          listEquipment(),
          listPorts(),
          listEquipmentLinks(),
        ]);
      setRoom(r);
      setRoomEquipment(roomEq);
      setAllEquipment(allEq);
      setPorts(allPorts);
      setLinks(allLinks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  const roomEquipmentIds = useMemo(() => new Set(roomEquipment.map((e) => e.id)), [roomEquipment]);
  const roomLinks = useMemo(
    () => links.filter((l) => roomEquipmentIds.has(l.parentEquipmentId) || roomEquipmentIds.has(l.childEquipmentId)),
    [links, roomEquipmentIds]
  );

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
    const equipment = allEquipment.find((e) => e.id === equipmentId);
    if (!equipment) return [];
    return ports.filter((p) => p.hardwareModelId === equipment.hardwareModelId && !usedPortIds.has(p.id));
  }

  const parentPortOptions = availablePortsFor(parentEquipmentId);
  const childPortOptions = availablePortsFor(childEquipmentId);

  async function handleDeleteEquipment(id: number) {
    if (!window.confirm("Supprimer ce matériel ?")) return;
    try {
      await deleteEquipment(id);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

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
  if (error) return <p className="error">{error}</p>;
  if (!room) return null;

  return (
    <div>
      <div className="card">
        <div className="page-header">
          <h1>{room.name}</h1>
          <Link to={`/sites/${siteId}/zones/${zoneId}/rooms/${roomId}/equipment/new`} className="btn">
            Ajouter du matériel
          </Link>
        </div>
        <p className="muted">
          {room.siteName} / {room.zoneName}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Matériel</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roomEquipment.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.deviceType}</td>
                <td>
                  {item.brandName} — {item.hardwareModel}
                </td>
                <td className="table-actions">
                  <Link to={`/sites/${siteId}/zones/${zoneId}/rooms/${roomId}/equipment/${item.id}/edit`}>
                    Modifier
                  </Link>
                  <button className="danger" onClick={() => handleDeleteEquipment(item.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {roomEquipment.length === 0 && <p className="muted">Aucun matériel dans cette salle.</p>}
      </div>

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
              {allEquipment.map((e) => (
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
              {allEquipment.map((e) => (
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
            {roomLinks.map((link) => (
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
        {roomLinks.length === 0 && <p className="muted">Aucune liaison pour cette salle.</p>}
      </div>
    </div>
  );
}
