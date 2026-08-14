import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listSites } from "../../api/sites";
import type { Site } from "../../api/sites";
import { listZones } from "../../api/zones";
import type { Zone } from "../../api/zones";
import { listRooms } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { useSitesTree } from "../../context/SitesTreeContext";

export function SitesTree() {
  const params = useParams();
  const activeSiteId = Number(params.siteId ?? params.id) || null;
  const activeZoneId = Number(params.zoneId) || null;
  const activeRoomId = Number(params.roomId) || null;
  const { version } = useSitesTree();

  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [collapsedSites, setCollapsedSites] = useState<Set<number>>(new Set());
  const [collapsedZones, setCollapsedZones] = useState<Set<number>>(new Set());

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
                        <div className={`tree-node${zone.id === activeZoneId ? " active" : ""}`}>
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
                                <div className="tree-node tree-leaf">
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
    </nav>
  );
}
