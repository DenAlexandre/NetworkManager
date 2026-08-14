import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listEquipmentLinks } from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";

interface ChildEdge {
  link: EquipmentLink;
  child: Equipment;
}

export function EquipmentLinksTree() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([listEquipment(), listEquipmentLinks()]).then(([{ equipment: eq }, { links: lk }]) => {
      setEquipment(eq);
      setLinks(lk);
    });
  }, []);

  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number, ChildEdge[]>();
    for (const link of links) {
      const child = equipmentById.get(link.childEquipmentId);
      if (!child) continue;
      const list = map.get(link.parentEquipmentId) ?? [];
      list.push({ link, child });
      map.set(link.parentEquipmentId, list);
    }
    return map;
  }, [links, equipmentById]);

  const childIds = useMemo(() => new Set(links.map((l) => l.childEquipmentId)), [links]);
  const roots = useMemo(() => equipment.filter((e) => !childIds.has(e.id)), [equipment, childIds]);

  function toggle(nodeId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function renderNode(item: Equipment, path: number[], viaLabel?: string) {
    const key = [...path, item.id].join(">");
    const isCycle = path.includes(item.id);
    const edges = isCycle ? [] : childrenByParent.get(item.id) ?? [];
    const canExpand = edges.length > 0;
    const isExpanded = canExpand && !collapsed.has(item.id);

    return (
      <li key={key}>
        <div className="tree-node">
          {canExpand ? (
            <button
              type="button"
              className="tree-toggle"
              onClick={() => toggle(item.id)}
              aria-label={isExpanded ? "Réduire" : "Développer"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="tree-toggle-spacer" />
          )}
          <Link to={`/equipment?edit=${item.id}`}>{item.name}</Link>
          {viaLabel && <span className="tree-via">{viaLabel}</span>}
        </div>
        {canExpand && isExpanded && (
          <ul>
            {edges.map(({ link, child }) =>
              renderNode(child, [...path, item.id], `${link.parentPortLabel} → ${link.childPortLabel}`)
            )}
          </ul>
        )}
      </li>
    );
  }

  return (
    <nav className="tree">
      <ul>{roots.map((item) => renderNode(item, []))}</ul>
      {roots.length === 0 && <p className="tree-empty">Aucun matériel.</p>}
    </nav>
  );
}
