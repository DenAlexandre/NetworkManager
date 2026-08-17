import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import { createEquipmentLink, deleteEquipmentLink, listEquipmentLinks } from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";
import { listApis } from "../../api/apis";
import type { Api } from "../../api/apis";
import { getDesignSchema, saveDesignSchema } from "../../api/designSchemas";
import { hardwareModelImageUrl } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";

interface Card {
  equipmentId: number;
  x: number;
  y: number;
  width?: number;
}

interface PendingPort {
  equipmentId: number;
  portId: number;
}

type Endpoints = Record<string, { x: number; y: number }>;

function endpointKey(equipmentId: number, portId: number) {
  return `${equipmentId}:${portId}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1;
const ZOOM_STEP = 0.05;

const DEFAULT_CARD_WIDTH = 190;
const MIN_CARD_WIDTH = 120;
const MAX_CARD_WIDTH = 480;

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function DesignPage() {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [allPorts, setAllPorts] = useState<Port[]>([]);
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cards, setCards] = useState<Card[]>([]);
  const [addEquipmentId, setAddEquipmentId] = useState<number | "">("");
  const [pendingPort, setPendingPort] = useState<PendingPort | null>(null);
  const [dragging, setDragging] = useState<{ equipmentId: number; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ equipmentId: number; startX: number; startWidth: number } | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoints>({});
  const [naturalSizes, setNaturalSizes] = useState<Record<number, { width: number; height: number }>>({});
  const [bendOverrides, setBendOverrides] = useState<Record<number, number>>({});
  const [bendDrag, setBendDrag] = useState<{ linkId: number; startX: number } | null>(null);
  const bendMovedRef = useRef(false);
  const [zoom, setZoom] = useState(1);

  const [apis, setApis] = useState<Api[]>([]);
  const [selectedApiId, setSelectedApiId] = useState<number | "">("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    Promise.all([listEquipment(), listPorts(), listEquipmentLinks(), listApis()])
      .then(([eqRes, portsRes, linksRes, apisRes]) => {
        setEquipmentList(eqRes.equipment);
        setAllPorts(portsRes.ports);
        setLinks(linksRes.links);
        setApis(apisRes.apis);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  const equipmentById = useMemo(() => new Map(equipmentList.map((e) => [e.id, e])), [equipmentList]);
  const portsById = useMemo(() => new Map(allPorts.map((p) => [p.id, p])), [allPorts]);
  const portsByModel = useMemo(() => {
    const map = new Map<number, Port[]>();
    for (const port of allPorts) {
      const list = map.get(port.hardwareModelId) ?? [];
      list.push(port);
      map.set(port.hardwareModelId, list);
    }
    return map;
  }, [allPorts]);

  const linkedPortIds = useMemo(() => {
    const set = new Set<number>();
    for (const link of links) {
      set.add(link.parentPortId);
      set.add(link.childPortId);
    }
    return set;
  }, [links]);

  const availableEquipment = useMemo(
    () => equipmentList.filter((e) => !cards.some((c) => c.equipmentId === e.id)),
    [equipmentList, cards]
  );

  function recomputeEndpoints() {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const next: Endpoints = {};
    for (const card of cards) {
      const img = imgRefs.current[card.equipmentId];
      if (!img) continue;
      const imgRect = img.getBoundingClientRect();
      const equipment = equipmentById.get(card.equipmentId);
      if (!equipment) continue;
      const modelPorts = portsByModel.get(equipment.hardwareModelId) ?? [];
      if (!img.naturalWidth || !img.naturalHeight) continue;
      for (const p of modelPorts) {
        if (p.regionX === null || p.regionY === null || p.regionWidth === null || p.regionHeight === null) continue;
        next[endpointKey(card.equipmentId, p.id)] = {
          x: imgRect.left - canvasRect.left + ((p.regionX + p.regionWidth / 2) / img.naturalWidth) * imgRect.width,
          y: imgRect.top - canvasRect.top + ((p.regionY + p.regionHeight / 2) / img.naturalHeight) * imgRect.height,
        };
      }
    }
    setEndpoints(next);
  }

  useLayoutEffect(() => {
    recomputeEndpoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, portsByModel, equipmentById, zoom]);

  useEffect(() => {
    window.addEventListener("resize", recomputeEndpoints);
    return () => window.removeEventListener("resize", recomputeEndpoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, portsByModel, equipmentById]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect || !dragging) return;
      const x = (e.clientX - canvasRect.left) / zoom - dragging.offsetX;
      const y = (e.clientY - canvasRect.top) / zoom - dragging.offsetY;
      setCards((prev) => prev.map((c) => (c.equipmentId === dragging.equipmentId ? { ...c, x, y } : c)));
    }
    function onUp() {
      setDragging(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, zoom]);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      if (!resizing) return;
      const deltaX = (e.clientX - resizing.startX) / zoom;
      const width = clamp(resizing.startWidth + deltaX, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
      setCards((prev) => prev.map((c) => (c.equipmentId === resizing.equipmentId ? { ...c, width } : c)));
    }
    function onUp() {
      setResizing(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, zoom]);

  function handleResizeMouseDown(e: ReactMouseEvent, card: Card) {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ equipmentId: card.equipmentId, startX: e.clientX, startWidth: card.width ?? DEFAULT_CARD_WIDTH });
  }

  useEffect(() => {
    if (!bendDrag) return;
    bendMovedRef.current = false;
    function onMove(e: MouseEvent) {
      const canvasEl = canvasRef.current;
      const canvasRect = canvasEl?.getBoundingClientRect();
      if (!canvasEl || !canvasRect || !bendDrag) return;
      if (Math.abs(e.clientX - bendDrag.startX) > 4) bendMovedRef.current = true;
      const link = links.find((l) => l.id === bendDrag.linkId);
      if (!link) return;
      const from = endpoints[endpointKey(link.parentEquipmentId, link.parentPortId)];
      const to = endpoints[endpointKey(link.childEquipmentId, link.childPortId)];
      if (!from || !to) return;
      // Clamp to the canvas's own scrollable extent (the real frame) rather than the span
      // between the two ports, so the bend can be dragged out past the equipment cards to
      // route the link around them, while still staying reachable/visible on the canvas.
      const x = clamp(e.clientX - canvasRect.left, 0, canvasEl.scrollWidth);
      // Stored as a ratio between the two endpoints (not an absolute pixel position) so the
      // bend stays proportionally in place, and the link stays visually identical, when the
      // canvas is zoomed in/out and the endpoints move.
      const ratio = to.x === from.x ? 0.5 : (x - from.x) / (to.x - from.x);
      setBendOverrides((prev) => ({ ...prev, [bendDrag.linkId]: ratio }));
    }
    function onUp() {
      if (!bendMovedRef.current && bendDrag) {
        setBendOverrides((prev) => {
          const next = { ...prev };
          delete next[bendDrag.linkId];
          return next;
        });
        handleDeleteLink(bendDrag.linkId);
      }
      setBendDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bendDrag]);

  function handleBendMouseDown(e: ReactMouseEvent, linkId: number) {
    e.stopPropagation();
    setBendDrag({ linkId, startX: e.clientX });
  }

  async function loadLinks() {
    try {
      const { links } = await listEquipmentLinks();
      setLinks(links);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    }
  }

  function handleAddCard() {
    if (addEquipmentId === "") return;
    setCards((prev) => [
      ...prev,
      { equipmentId: Number(addEquipmentId), x: 40 + (prev.length % 4) * 260, y: 40 + Math.floor(prev.length / 4) * 300 },
    ]);
    setAddEquipmentId("");
  }

  function handleRemoveCard(equipmentId: number) {
    setCards((prev) => prev.filter((c) => c.equipmentId !== equipmentId));
    if (pendingPort?.equipmentId === equipmentId) setPendingPort(null);
  }

  function handleHeaderMouseDown(e: ReactMouseEvent, card: Card) {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    setDragging({
      equipmentId: card.equipmentId,
      offsetX: (e.clientX - canvasRect.left) / zoom - card.x,
      offsetY: (e.clientY - canvasRect.top) / zoom - card.y,
    });
  }

  function handleZoomChange(next: number) {
    setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM));
  }

  async function handlePortMouseDown(e: ReactMouseEvent, equipmentId: number, portId: number) {
    e.stopPropagation();
    if (!pendingPort) {
      setPendingPort({ equipmentId, portId });
      return;
    }
    if (pendingPort.equipmentId === equipmentId && pendingPort.portId === portId) {
      setPendingPort(null);
      return;
    }
    if (pendingPort.equipmentId === equipmentId) {
      setPendingPort({ equipmentId, portId });
      return;
    }
    const from = pendingPort;
    setPendingPort(null);
    setError(null);
    try {
      await createEquipmentLink({
        parentEquipmentId: from.equipmentId,
        parentPortId: from.portId,
        childEquipmentId: equipmentId,
        childPortId: portId,
      });
      await loadLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la création de la liaison.");
    }
  }

  async function handleDeleteLink(linkId: number) {
    if (!window.confirm("Supprimer cette liaison ?")) return;
    try {
      await deleteEquipmentLink(linkId);
      await loadLinks();
      setBendOverrides((prev) => {
        const next = { ...prev };
        delete next[linkId];
        return next;
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleSelectApi(value: string) {
    const apiId = value ? Number(value) : "";
    setSelectedApiId(apiId);
    setPendingPort(null);
    if (apiId === "") {
      setCards([]);
      setBendOverrides({});
      return;
    }
    setSchemaLoading(true);
    setError(null);
    try {
      const { schema } = await getDesignSchema(apiId);
      if (schema) {
        const validEquipmentIds = new Set(equipmentList.map((e) => e.id));
        setCards(schema.layout.cards.filter((c) => validEquipmentIds.has(c.equipmentId)));
        setBendOverrides(schema.layout.bends ?? {});
      } else {
        setCards([]);
        setBendOverrides({});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors du chargement du schéma.");
    } finally {
      setSchemaLoading(false);
    }
  }

  async function handleSaveSchema() {
    if (selectedApiId === "") return;
    setSchemaSaving(true);
    setError(null);
    try {
      await saveDesignSchema(selectedApiId, { cards, bends: bendOverrides });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement du schéma.");
    } finally {
      setSchemaSaving(false);
    }
  }

  const visibleLinks = useMemo(() => {
    const onCanvas = new Set(cards.map((c) => c.equipmentId));
    return links
      .filter((l) => onCanvas.has(l.parentEquipmentId) && onCanvas.has(l.childEquipmentId))
      .map((l) => {
        const from = endpoints[endpointKey(l.parentEquipmentId, l.parentPortId)];
        const to = endpoints[endpointKey(l.childEquipmentId, l.childPortId)];
        if (!from || !to) return null;
        const parentPort = portsById.get(l.parentPortId);
        const bendRatio = bendOverrides[l.id] ?? 0.5;
        const midX = from.x + bendRatio * (to.x - from.x);
        return {
          link: l,
          from,
          to,
          midX,
          color: parentPort?.linkTypeColor ?? "#8b5cf6",
          strokeWidth: parentPort?.linkTypeStrokeWidth ?? 3,
        };
      })
      .filter(
        (v): v is {
          link: EquipmentLink;
          from: { x: number; y: number };
          to: { x: number; y: number };
          midX: number;
          color: string;
          strokeWidth: number;
        } => v !== null
      );
  }, [cards, links, endpoints, portsById, bendOverrides]);

  async function handleExportSvg() {
    const canvasEl = canvasRef.current;
    if (!canvasEl || cards.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const canvasRect = canvasEl.getBoundingClientRect();
      const imageCache = new Map<string, string>();
      async function resolveImage(path: string) {
        if (!imageCache.has(path)) {
          imageCache.set(path, await fetchImageAsDataUrl(hardwareModelImageUrl(path)));
        }
        return imageCache.get(path)!;
      }

      const cardGeoms: {
        x: number;
        y: number;
        width: number;
        height: number;
        headerHeight: number;
        name: string;
        image?: { x: number; y: number; width: number; height: number; dataUrl: string };
        ports: { x: number; y: number; width: number; height: number; color: string }[];
      }[] = [];

      for (const card of cards) {
        const equipment = equipmentById.get(card.equipmentId);
        const cardEl = cardRefs.current[card.equipmentId];
        if (!equipment || !cardEl) continue;
        const cardRect = cardEl.getBoundingClientRect();
        const x = cardRect.left - canvasRect.left;
        const y = cardRect.top - canvasRect.top;
        const geom = {
          x,
          y,
          width: cardRect.width,
          height: cardRect.height,
          headerHeight: cardRect.height,
          name: equipment.name,
          ports: [] as { x: number; y: number; width: number; height: number; color: string }[],
          image: undefined as { x: number; y: number; width: number; height: number; dataUrl: string } | undefined,
        };

        const img = imgRefs.current[card.equipmentId];
        if (img && equipment.hardwareModelImagePath) {
          const imgRect = img.getBoundingClientRect();
          const imgLocalX = imgRect.left - cardRect.left;
          const imgLocalY = imgRect.top - cardRect.top;
          geom.headerHeight = imgLocalY;
          geom.image = {
            x: imgLocalX,
            y: imgLocalY,
            width: imgRect.width,
            height: imgRect.height,
            dataUrl: await resolveImage(equipment.hardwareModelImagePath),
          };
          const naturalSize = naturalSizes[card.equipmentId];
          if (naturalSize) {
            const modelPorts = portsByModel.get(equipment.hardwareModelId) ?? [];
            for (const p of modelPorts) {
              if (p.regionX === null || p.regionY === null || p.regionWidth === null || p.regionHeight === null) continue;
              geom.ports.push({
                x: imgLocalX + (p.regionX / naturalSize.width) * imgRect.width,
                y: imgLocalY + (p.regionY / naturalSize.height) * imgRect.height,
                width: (p.regionWidth / naturalSize.width) * imgRect.width,
                height: (p.regionHeight / naturalSize.height) * imgRect.height,
                color: p.linkTypeColor,
              });
            }
          }
        }
        cardGeoms.push(geom);
      }

      const linkGeoms = visibleLinks.map(({ from, to, midX, color, strokeWidth }) => ({ from, to, midX, color, strokeWidth }));

      const xs = cardGeoms
        .flatMap((c) => [c.x, c.x + c.width])
        .concat(linkGeoms.flatMap((l) => [l.from.x, l.to.x, l.midX]));
      const ys = cardGeoms
        .flatMap((c) => [c.y, c.y + c.height])
        .concat(linkGeoms.flatMap((l) => [l.from.y, l.to.y]));
      const minX = Math.min(0, ...xs);
      const minY = Math.min(0, ...ys);
      const maxX = Math.max(0, ...xs);
      const maxY = Math.max(0, ...ys);
      const margin = 24;
      const offsetX = margin - minX;
      const offsetY = margin - minY;
      const width = Math.ceil(maxX - minX + margin * 2);
      const height = Math.ceil(maxY - minY + margin * 2);

      const linkMarkup = linkGeoms
        .map(({ from, to, midX, color, strokeWidth }) => {
          const points = [
            [from.x + offsetX, from.y + offsetY],
            [midX + offsetX, from.y + offsetY],
            [midX + offsetX, to.y + offsetY],
            [to.x + offsetX, to.y + offsetY],
          ]
            .map(([px, py]) => `${px},${py}`)
            .join(" ");
          return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
        })
        .join("\n  ");

      const cardMarkup = cardGeoms
        .map((c) => {
          const parts = [
            `<rect x="0" y="0" width="${c.width}" height="${c.height}" rx="12" fill="#ffffff" stroke="#e6e3ee" stroke-width="1" />`,
            `<rect x="0" y="0" width="${c.width}" height="${c.headerHeight}" fill="#f1ebfe" />`,
            `<text x="10" y="${c.headerHeight / 2 + 4}" font-size="13" font-weight="600" fill="#15111f">${escapeXml(c.name)}</text>`,
          ];
          if (c.image) {
            parts.push(
              `<image x="${c.image.x}" y="${c.image.y}" width="${c.image.width}" height="${c.image.height}" href="${c.image.dataUrl}" preserveAspectRatio="none" />`
            );
          }
          for (const p of c.ports) {
            parts.push(
              `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="transparent" stroke="${p.color}" stroke-width="2" />`
            );
          }
          return `<g transform="translate(${c.x + offsetX}, ${c.y + offsetY})">${parts.join("")}</g>`;
        })
        .join("\n  ");

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f7f6fb" />
  ${cardMarkup}
  ${linkMarkup}
</svg>
`;

      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const apiName = apis.find((a) => a.id === selectedApiId)?.name;
      anchor.href = url;
      anchor.download = `schema${apiName ? `-${apiName}` : ""}.svg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'export SVG.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Design</h2>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="design-toolbar">
        <div className="design-toolbar-group">
          <label>
            API
            <select value={selectedApiId} onChange={(e) => handleSelectApi(e.target.value)} disabled={schemaLoading}>
              <option value="">Aucune (non enregistré)</option>
              {apis.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-sm" onClick={handleSaveSchema} disabled={selectedApiId === "" || schemaSaving}>
            {schemaSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button type="button" className="btn-outline btn-sm" onClick={handleExportSvg} disabled={exporting || cards.length === 0}>
            {exporting ? "Export..." : "Exporter en SVG"}
          </button>
        </div>

        <span className="design-toolbar-sep" />

        <div className="design-toolbar-group">
          <select
            value={addEquipmentId}
            onChange={(e) => setAddEquipmentId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Ajouter un matériel"
          >
            <option value="">Ajouter un matériel...</option>
            {availableEquipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.brandName} {e.hardwareModel}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={handleAddCard} disabled={addEquipmentId === ""}>
            + Ajouter
          </button>
        </div>

        <span className="design-toolbar-sep" />

        <div className="design-toolbar-group design-canvas-zoom">
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => handleZoomChange(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
          >
            −
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
          />
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => handleZoomChange(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
          >
            +
          </button>
          <span className="design-canvas-zoom-value">{Math.round(zoom * 100)}%</span>
          <button type="button" className="link" onClick={() => handleZoomChange(1)}>
            Réinitialiser
          </button>
        </div>
      </div>

      {pendingPort && (
        <p className="muted">
          Cliquez sur un second port pour créer la liaison, ou recliquez sur le premier port pour annuler.
        </p>
      )}

      <div className="design-canvas" ref={canvasRef}>
        <div className="design-canvas-zoom-layer" style={{ transform: `scale(${zoom})` }}>
          {cards.map((card) => {
            const equipment = equipmentById.get(card.equipmentId);
            if (!equipment) return null;
            const modelPorts = portsByModel.get(equipment.hardwareModelId) ?? [];
            const placedPorts = modelPorts.filter((p) => p.regionX !== null);
            const naturalSize = naturalSizes[card.equipmentId];
            return (
              <div
                key={card.equipmentId}
                className="design-card"
                style={{ left: card.x, top: card.y, width: card.width ?? DEFAULT_CARD_WIDTH }}
                ref={(el) => {
                  cardRefs.current[card.equipmentId] = el;
                }}
              >
                <div className="design-card-header" onMouseDown={(e) => handleHeaderMouseDown(e, card)}>
                  <span>{equipment.name}</span>
                  <button
                    type="button"
                    className="design-card-remove"
                    onClick={() => handleRemoveCard(card.equipmentId)}
                    aria-label="Retirer"
                  >
                    ×
                  </button>
                </div>
                {equipment.hardwareModelImagePath ? (
                  <div className="design-card-stage">
                    <img
                      ref={(el) => {
                        imgRefs.current[card.equipmentId] = el;
                      }}
                      src={hardwareModelImageUrl(equipment.hardwareModelImagePath)}
                      alt={equipment.hardwareModel}
                      draggable={false}
                      onLoad={(e) => {
                        const width = e.currentTarget.naturalWidth;
                        const height = e.currentTarget.naturalHeight;
                        setNaturalSizes((prev) => ({ ...prev, [card.equipmentId]: { width, height } }));
                        recomputeEndpoints();
                      }}
                    />
                    {naturalSize &&
                      placedPorts.map((p) => (
                        <div
                          key={p.id}
                          className={`port-region${
                            pendingPort?.equipmentId === card.equipmentId && pendingPort.portId === p.id ? " selected" : ""
                          }${linkedPortIds.has(p.id) ? " linked" : ""}`}
                          style={{
                            left: `${(p.regionX! / naturalSize.width) * 100}%`,
                            top: `${(p.regionY! / naturalSize.height) * 100}%`,
                            width: `${(p.regionWidth! / naturalSize.width) * 100}%`,
                            height: `${(p.regionHeight! / naturalSize.height) * 100}%`,
                            borderColor: p.linkTypeColor,
                          }}
                          onMouseDown={(e) => handlePortMouseDown(e, card.equipmentId, p.id)}
                          title={p.label}
                        >
                          <span>{p.label}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="muted design-card-noimage">Pas d'image pour ce modèle.</p>
                )}
                <div
                  className="design-card-resize"
                  onMouseDown={(e) => handleResizeMouseDown(e, card)}
                  title="Glisser pour redimensionner"
                />
              </div>
            );
          })}
        </div>

        {cards.length === 0 && <p className="muted design-canvas-empty">Ajoutez du matériel pour commencer.</p>}

        <svg className="design-canvas-svg">
          {visibleLinks.map(({ link, from, to, midX, color, strokeWidth }) => {
            const corner1 = { x: midX, y: from.y };
            const corner2 = { x: midX, y: to.y };
            const tooltip = `${link.parentEquipmentName} (${link.parentPortLabel}) ↔ ${link.childEquipmentName} (${link.childPortLabel})`;
            return (
              <g key={link.id}>
                <polyline
                  points={`${from.x},${from.y} ${corner1.x},${corner1.y} ${corner2.x},${corner2.y} ${to.x},${to.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  pointerEvents="none"
                />
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={corner1.x}
                  y2={corner1.y}
                  className="design-link-hit"
                  onClick={() => handleDeleteLink(link.id)}
                >
                  <title>{tooltip}</title>
                </line>
                <line
                  x1={corner1.x}
                  y1={corner1.y}
                  x2={corner2.x}
                  y2={corner2.y}
                  className="design-link-hit design-link-bend"
                  onMouseDown={(e) => handleBendMouseDown(e, link.id)}
                >
                  <title>Glisser pour déplacer la liaison, cliquer pour la supprimer</title>
                </line>
                <line
                  x1={corner2.x}
                  y1={corner2.y}
                  x2={to.x}
                  y2={to.y}
                  className="design-link-hit"
                  onClick={() => handleDeleteLink(link.id)}
                >
                  <title>{tooltip}</title>
                </line>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
