import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { listSites } from "../../api/sites";
import type { Site } from "../../api/sites";
import { listZones } from "../../api/zones";
import type { Zone } from "../../api/zones";
import { listRooms, updateRoom } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";

const ROOM_DND_TYPE = "application/x-networkmanager-room-id";

export function SitesTree() {
  const params = useParams();
  const activeSiteId = Number(params.siteId ?? params.id) || null;
  const activeZoneId = Number(params.zoneId) || null;
  const activeRoomId = Number(params.roomId) || null;
  const { version, refresh } = useSitesTree();

  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [collapsedSites, setCollapsedSites] = useState<Set<number>>(new Set());
  const [collapsedZones, setCollapsedZones] = useState<Set<number>>(new Set());
  const [draggingRoomId, setDraggingRoomId] = useState<number | null>(null);
  const [dragOverZoneId, setDragOverZoneId] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listSites(), listZones(), listRooms()]).then(([{ sites: s }, { zones: z }, { rooms: r }]) => {
      setSites(s);
      setZones(z);
      setRooms(r);
    });
  }, [version]);

  const zonesBySite = useMemo(() => {
    const map = new Map<number, Zone[]>();
    for (const zone of zones) {
      const list = map.get(zone.siteId) ?? [];
      list.push(zone);
      map.set(zone.siteId, list);
    }
    return map;
  }, [zones]);

  const roomsByZone = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const room of rooms) {
      const list = map.get(room.zoneId) ?? [];
      list.push(room);
      map.set(room.zoneId, list);
    }
    return map;
  }, [rooms]);

  function toggleSite(siteId: number) {
    setCollapsedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }

  function toggleZone(zoneId: number) {
    setCollapsedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  }

  function handleRoomDragStart(e: DragEvent, room: Room) {
    e.dataTransfer.setData(ROOM_DND_TYPE, String(room.id));
    e.dataTransfer.effectAllowed = "move";
    setDraggingRoomId(room.id);
  }

  function handleRoomDragEnd() {
    setDraggingRoomId(null);
    setDragOverZoneId(null);
  }

  function handleZoneDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(ROOM_DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleZoneDrop(e: DragEvent, zone: Zone) {
    const raw = e.dataTransfer.getData(ROOM_DND_TYPE);
    setDragOverZoneId(null);
    setDraggingRoomId(null);
    if (!raw) return;
    e.preventDefault();
    const roomId = Number(raw);
    const room = rooms.find((r) => r.id === roomId);
    if (!room || room.zoneId === zone.id) return;

    setMoveError(null);
    try {
      await updateRoom(roomId, { zoneId: zone.id, name: room.name });
      refresh();
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : "Erreur lors du déplacement de la salle.");
    }
  }

  return (
    <nav className="tree">
      <ul>
        {sites.map((site) => {
          const siteZones = zonesBySite.get(site.id) ?? [];
          const expanded = !collapsedSites.has(site.id);
          return (
            <li key={site.id}>
              <div className={`tree-node${site.id === activeSiteId ? " active" : ""}`}>
                {siteZones.length > 0 ? (
                  <button
                    type="button"
                    className="tree-toggle"
                    onClick={() => toggleSite(site.id)}
                    aria-label={expanded ? "Réduire" : "Développer"}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="tree-toggle-spacer" />
                )}
                <Link to={`/sites/${site.id}`}>{site.name}</Link>
              </div>
              {expanded && siteZones.length > 0 && (
                <ul>
                  {siteZones.map((zone) => {
                    const zoneRooms = roomsByZone.get(zone.id) ?? [];
                    const zoneExpanded = !collapsedZones.has(zone.id);
                    return (
                      <li key={zone.id}>
                        <div
                          className={`tree-node${zone.id === activeZoneId ? " active" : ""}${
                            zone.id === dragOverZoneId ? " drag-over" : ""
                          }`}
                          onDragOver={handleZoneDragOver}
                          onDragEnter={() => setDragOverZoneId(zone.id)}
                          onDragLeave={() => setDragOverZoneId((prev) => (prev === zone.id ? null : prev))}
                          onDrop={(e) => handleZoneDrop(e, zone)}
                        >
                          {zoneRooms.length > 0 ? (
                            <button
                              type="button"
                              className="tree-toggle"
                              onClick={() => toggleZone(zone.id)}
                              aria-label={zoneExpanded ? "Réduire" : "Développer"}
                            >
                              {zoneExpanded ? "▾" : "▸"}
                            </button>
                          ) : (
                            <span className="tree-toggle-spacer" />
                          )}
                          <Link to={`/sites/${site.id}/zones/${zone.id}`}>{zone.name}</Link>
                        </div>
                        {zoneExpanded && zoneRooms.length > 0 && (
                          <ul>
                            {zoneRooms.map((room) => (
                              <li key={room.id}>
                                <div
                                  className={`tree-node tree-leaf${room.id === draggingRoomId ? " dragging" : ""}`}
                                  draggable
                                  onDragStart={(e) => handleRoomDragStart(e, room)}
                                  onDragEnd={handleRoomDragEnd}
                                >
                                  <span className="tree-toggle-spacer" />
                                  <Link
                                    className={room.id === activeRoomId ? "active" : ""}
                                    to={`/sites/${site.id}/zones/${zone.id}/rooms/${room.id}`}
                                  >
                                    {room.name}
                                  </Link>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {sites.length === 0 && <p className="tree-empty">Aucun site.</p>}
      {moveError && <p className="error">{moveError}</p>}
    </nav>
  );
}
