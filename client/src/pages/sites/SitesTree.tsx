import { useEffect, useState } from "react";
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
  const [zonesBySite, setZonesBySite] = useState<Record<number, Zone[]>>({});
  const [roomsByZone, setRoomsByZone] = useState<Record<number, Room[]>>({});
  const [expandedSites, setExpandedSites] = useState<Set<number>>(new Set());
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());

  useEffect(() => {
    listSites().then(({ sites }) => setSites(sites));
    expandedSites.forEach((id) => loadZones(id, true));
    expandedZones.forEach((id) => loadRooms(id, true));
  }, [version]);

  useEffect(() => {
    if (!activeSiteId) return;
    setExpandedSites((prev) => new Set(prev).add(activeSiteId));
    loadZones(activeSiteId);
  }, [activeSiteId]);

  useEffect(() => {
    if (!activeZoneId) return;
    setExpandedZones((prev) => new Set(prev).add(activeZoneId));
    loadRooms(activeZoneId);
  }, [activeZoneId]);

  function loadZones(siteId: number, force = false) {
    setZonesBySite((prev) => {
      if (!force && prev[siteId]) return prev;
      listZones(siteId).then(({ zones }) => setZonesBySite((p) => ({ ...p, [siteId]: zones })));
      return prev;
    });
  }

  function loadRooms(zoneId: number, force = false) {
    setRoomsByZone((prev) => {
      if (!force && prev[zoneId]) return prev;
      listRooms(zoneId).then(({ rooms }) => setRoomsByZone((p) => ({ ...p, [zoneId]: rooms })));
      return prev;
    });
  }

  function toggleSite(siteId: number) {
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
    loadZones(siteId);
  }

  function toggleZone(zoneId: number) {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
    loadRooms(zoneId);
  }

  return (
    <nav className="tree">
      <ul>
        {sites.map((site) => (
          <li key={site.id}>
            <div className={`tree-node${site.id === activeSiteId ? " active" : ""}`}>
              <button
                type="button"
                className="tree-toggle"
                onClick={() => toggleSite(site.id)}
                aria-label={expandedSites.has(site.id) ? "Réduire" : "Développer"}
              >
                {expandedSites.has(site.id) ? "▾" : "▸"}
              </button>
              <Link to={`/sites/${site.id}`}>{site.name}</Link>
            </div>
            {expandedSites.has(site.id) && (
              <ul>
                {(zonesBySite[site.id] ?? []).map((zone) => (
                  <li key={zone.id}>
                    <div className={`tree-node${zone.id === activeZoneId ? " active" : ""}`}>
                      <button
                        type="button"
                        className="tree-toggle"
                        onClick={() => toggleZone(zone.id)}
                        aria-label={expandedZones.has(zone.id) ? "Réduire" : "Développer"}
                      >
                        {expandedZones.has(zone.id) ? "▾" : "▸"}
                      </button>
                      <Link to={`/sites/${site.id}/zones/${zone.id}`}>{zone.name}</Link>
                    </div>
                    {expandedZones.has(zone.id) && (
                      <ul>
                        {(roomsByZone[zone.id] ?? []).map((room) => (
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
                        {roomsByZone[zone.id]?.length === 0 && <li className="tree-empty">Aucune salle</li>}
                      </ul>
                    )}
                  </li>
                ))}
                {zonesBySite[site.id]?.length === 0 && <li className="tree-empty">Aucune zone</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {sites.length === 0 && <p className="tree-empty">Aucun site.</p>}
    </nav>
  );
}
