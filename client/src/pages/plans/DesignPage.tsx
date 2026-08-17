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

interface TextBlock {
  id: number;
  x: number;
  y: number;
  fontSize: number;
  text: string;
}

function textBlockSize(block: Pick<TextBlock, "text" | "fontSize">) {
  const lines = block.text.split("\n");
  const longestLine = Math.max(1, ...lines.map((l) => l.length));
  return {
    width: clamp(longestLine * block.fontSize * 0.62 + 16, 60, 700),
    height: lines.length * block.fontSize * 1.35 + 10,
  };
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

const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 72;

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

  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [draggingText, setDraggingText] = useState<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const [resizingText, setResizingText] = useState<{ id: number; startX: number; startFontSize: number } | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoints>({});
  const [naturalSizes, setNaturalSizes] = useState<Record<number, { width: number; height: number }>>({});
  const [bendOverrides, setBendOverrides] = useState<Record<number, number>>({});
  const [bendYOverrides, setBendYOverrides] = useState<Record<number, number>>({});
  const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);
  const [bendDrag, setBendDrag] = useState<{ linkId: number; startX: number; startY: number; axis: "x" | "y" | "both" } | null>(
    null
  );
  const [zoom, setZoom] = useState(1);

  const [apis, setApis] = useState<Api[]>([]);
  const [selectedApiId, setSelectedApiId] = useState<number | "">("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  // When a drag ends with the mouse over empty canvas, the browser's native click event (fired
  // after mouseup) targets the nearest common ancestor of the mousedown/mouseup elements, which
  // can be the canvas itself even though the user never intended to click it. Set before clearing
  // drag state so the canvas's onClick (which deselects the current link) can ignore that one.
  const suppressCanvasClickRef = useRef(false);

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
      suppressCanvasClickRef.current = true;
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
      suppressCanvasClickRef.current = true;
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
    if (!draggingText) return;
    function onMove(e: MouseEvent) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect || !draggingText) return;
      const x = (e.clientX - canvasRect.left) / zoom - draggingText.offsetX;
      const y = (e.clientY - canvasRect.top) / zoom - draggingText.offsetY;
      setTextBlocks((prev) => prev.map((t) => (t.id === draggingText.id ? { ...t, x, y } : t)));
    }
    function onUp() {
      suppressCanvasClickRef.current = true;
      setDraggingText(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingText, zoom]);

  function handleTextHeaderMouseDown(e: ReactMouseEvent, block: TextBlock) {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    setDraggingText({
      id: block.id,
      offsetX: (e.clientX - canvasRect.left) / zoom - block.x,
      offsetY: (e.clientY - canvasRect.top) / zoom - block.y,
    });
  }

  useEffect(() => {
    if (!resizingText) return;
    function onMove(e: MouseEvent) {
      if (!resizingText) return;
      const deltaX = (e.clientX - resizingText.startX) / zoom;
      const fontSize = clamp(resizingText.startFontSize + deltaX / 3, MIN_FONT_SIZE, MAX_FONT_SIZE);
      setTextBlocks((prev) => prev.map((t) => (t.id === resizingText.id ? { ...t, fontSize } : t)));
    }
    function onUp() {
      suppressCanvasClickRef.current = true;
      setResizingText(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingText, zoom]);

  function handleTextResizeMouseDown(e: ReactMouseEvent, block: TextBlock) {
    e.stopPropagation();
    e.preventDefault();
    setResizingText({ id: block.id, startX: e.clientX, startFontSize: block.fontSize });
  }

  function handleAddTextBlock() {
    setTextBlocks((prev) => [
      ...prev,
      {
        id: Date.now(),
        x: 40 + (prev.length % 4) * 200,
        y: 40 + Math.floor(prev.length / 4) * 140,
        fontSize: DEFAULT_FONT_SIZE,
        text: "Texte",
      },
    ]);
  }

  function handleRemoveTextBlock(id: number) {
    setTextBlocks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleTextChange(id: number, text: string) {
    setTextBlocks((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  }

  useEffect(() => {
    if (!bendDrag) return;
    function onMove(e: MouseEvent) {
      const canvasEl = canvasRef.current;
      const canvasRect = canvasEl?.getBoundingClientRect();
      if (!canvasEl || !canvasRect || !bendDrag) return;
      const link = links.find((l) => l.id === bendDrag.linkId);
      if (!link) return;
      const from = endpoints[endpointKey(link.parentEquipmentId, link.parentPortId)];
      const to = endpoints[endpointKey(link.childEquipmentId, link.childPortId)];
      if (!from || !to) return;
      // Clamp to the canvas's own scrollable extent (the real frame) rather than the span
      // between the two ports, so the bend can be dragged out past the equipment cards to
      // route the link around them, while still staying reachable/visible on the canvas.
      if (bendDrag.axis !== "y") {
        const x = clamp(e.clientX - canvasRect.left, 0, canvasEl.scrollWidth);
        // The horizontal position is stored as a ratio between the two endpoints (not an
        // absolute pixel position) so it stays proportionally in place, and the link stays
        // visually identical, when the canvas is zoomed in/out and the endpoints move.
        const ratio = to.x === from.x ? 0.5 : (x - from.x) / (to.x - from.x);
        setBendOverrides((prev) => ({ ...prev, [bendDrag.linkId]: ratio }));
      }
      if (bendDrag.axis !== "x") {
        const y = clamp(e.clientY - canvasRect.top, 0, canvasEl.scrollHeight);
        // The vertical position can't use the same ratio trick: when the two ports are at
        // (near) the same height, to.y - from.y is ~0 and any ratio would collapse back to the
        // same point, making a vertical detour impossible for the exact links that need one
        // most. Instead it's stored as an offset from "to.y", normalized by the current zoom
        // (like card x/y/width) so it scales correctly if the canvas is later zoomed. An offset
        // of 0 exactly reproduces the previous 3-segment elbow (no vertical detour).
        const yOffset = (y - to.y) / zoom;
        setBendYOverrides((prev) => ({ ...prev, [bendDrag.linkId]: yOffset }));
      }
    }
    function onUp() {
      suppressCanvasClickRef.current = true;
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

  function handleBendMouseDown(e: ReactMouseEvent, linkId: number, axis: "x" | "y" | "both") {
    e.stopPropagation();
    setBendDrag({ linkId, startX: e.clientX, startY: e.clientY, axis });
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
      setBendYOverrides((prev) => {
        const next = { ...prev };
        delete next[linkId];
        return next;
      });
      setSelectedLinkId((prev) => (prev === linkId ? null : prev));
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
      setBendYOverrides({});
      setTextBlocks([]);
      setZoom(1);
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
        setBendYOverrides(schema.layout.bendsY ?? {});
        setTextBlocks(schema.layout.textBlocks ?? []);
        setZoom(clamp(schema.layout.zoom ?? 1, MIN_ZOOM, MAX_ZOOM));
      } else {
        setCards([]);
        setBendOverrides({});
        setBendYOverrides({});
        setTextBlocks([]);
        setZoom(1);
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
      await saveDesignSchema(selectedApiId, { cards, bends: bendOverrides, bendsY: bendYOverrides, zoom, textBlocks });
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
        const bendYOffset = bendYOverrides[l.id] ?? 0;
        const midY = to.y + bendYOffset * zoom;
        return {
          link: l,
          from,
          to,
          midX,
          midY,
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
          midY: number;
          color: string;
          strokeWidth: number;
        } => v !== null
      );
  }, [cards, links, endpoints, portsById, bendOverrides, bendYOverrides, zoom]);

  async function handleExportSvg() {
    const canvasEl = canvasRef.current;
    if (!canvasEl || (cards.length === 0 && textBlocks.length === 0)) return;
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

      const linkGeoms = visibleLinks.map(({ from, to, midX, midY, color, strokeWidth }) => ({
        from,
        to,
        midX,
        midY,
        color,
        strokeWidth,
      }));

      const textGeoms = textBlocks.map((t) => {
        const size = textBlockSize(t);
        return {
          x: t.x * zoom,
          y: t.y * zoom,
          width: size.width * zoom,
          height: size.height * zoom,
          fontSize: t.fontSize * zoom,
          text: t.text,
        };
      });

      const xs = cardGeoms
        .flatMap((c) => [c.x, c.x + c.width])
        .concat(linkGeoms.flatMap((l) => [l.from.x, l.to.x, l.midX]))
        .concat(textGeoms.flatMap((t) => [t.x, t.x + t.width]));
      const ys = cardGeoms
        .flatMap((c) => [c.y, c.y + c.height])
        .concat(linkGeoms.flatMap((l) => [l.from.y, l.to.y, l.midY]))
        .concat(textGeoms.flatMap((t) => [t.y, t.y + t.height]));
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
        .map(({ from, to, midX, midY, color, strokeWidth }) => {
          const points = [
            [from.x + offsetX, from.y + offsetY],
            [midX + offsetX, from.y + offsetY],
            [midX + offsetX, midY + offsetY],
            [to.x + offsetX, midY + offsetY],
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

      const textMarkup = textGeoms
        .map((t) => {
          const lines = t.text.split("\n");
          const lineHeight = t.fontSize * 1.2;
          const tspans = lines
            .map((line, i) => `<tspan x="0" y="${t.fontSize + i * lineHeight}">${escapeXml(line)}</tspan>`)
            .join("");
          return `<text transform="translate(${t.x + offsetX}, ${t.y + offsetY})" font-size="${t.fontSize}" fill="#15111f">${tspans}</text>`;
        })
        .join("\n  ");

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f7f6fb" />
  ${cardMarkup}
  ${linkMarkup}
  ${textMarkup}
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
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={handleExportSvg}
            disabled={exporting || (cards.length === 0 && textBlocks.length === 0)}
          >
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

        <div className="design-toolbar-group">
          <button type="button" className="btn-outline btn-sm" onClick={handleAddTextBlock}>
            + Texte
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

      <div
        className="design-canvas"
        ref={canvasRef}
        onClick={() => {
          if (suppressCanvasClickRef.current) {
            suppressCanvasClickRef.current = false;
            return;
          }
          setSelectedLinkId(null);
        }}
      >
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

          {textBlocks.map((block) => {
            const size = textBlockSize(block);
            return (
              <div
                key={block.id}
                className="design-text-block"
                style={{ left: block.x, top: block.y, width: size.width, height: size.height }}
              >
                <div className="design-text-block-header" onMouseDown={(e) => handleTextHeaderMouseDown(e, block)}>
                  <button
                    type="button"
                    className="design-card-remove"
                    onClick={() => handleRemoveTextBlock(block.id)}
                    aria-label="Retirer"
                  >
                    ×
                  </button>
                </div>
                <textarea
                  className="design-text-block-content"
                  style={{ fontSize: block.fontSize }}
                  value={block.text}
                  onChange={(e) => handleTextChange(block.id, e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <div
                  className="design-card-resize"
                  onMouseDown={(e) => handleTextResizeMouseDown(e, block)}
                  title="Glisser pour agrandir/rétrécir le texte"
                />
              </div>
            );
          })}
        </div>

        {cards.length === 0 && textBlocks.length === 0 && (
          <p className="muted design-canvas-empty">Ajoutez du matériel pour commencer.</p>
        )}

        <svg className="design-canvas-svg">
          {visibleLinks.map(({ link, from, to, midX, midY, color, strokeWidth }) => {
            const corner1 = { x: midX, y: from.y };
            const corner2 = { x: midX, y: midY };
            const corner3 = { x: to.x, y: midY };
            const tooltip = `${link.parentEquipmentName} (${link.parentPortLabel}) ↔ ${link.childEquipmentName} (${link.childPortLabel})`;
            const selected = selectedLinkId === link.id;
            function selectLink(e: ReactMouseEvent) {
              e.stopPropagation();
              setSelectedLinkId(link.id);
            }
            function deleteLink(e: ReactMouseEvent) {
              e.stopPropagation();
              handleDeleteLink(link.id);
            }
            return (
              <g key={link.id}>
                <polyline
                  points={`${from.x},${from.y} ${corner1.x},${corner1.y} ${corner2.x},${corner2.y} ${corner3.x},${corner3.y} ${to.x},${to.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  pointerEvents="none"
                />
                <line x1={from.x} y1={from.y} x2={corner1.x} y2={corner1.y} className="design-link-hit" onClick={selectLink} onDoubleClick={deleteLink}>
                  <title>{tooltip}</title>
                </line>
                <line
                  x1={corner1.x}
                  y1={corner1.y}
                  x2={corner2.x}
                  y2={corner2.y}
                  className="design-link-hit"
                  onClick={selectLink}
                  onDoubleClick={deleteLink}
                >
                  <title>{tooltip}</title>
                </line>
                <line
                  x1={corner2.x}
                  y1={corner2.y}
                  x2={corner3.x}
                  y2={corner3.y}
                  className="design-link-hit"
                  onClick={selectLink}
                  onDoubleClick={deleteLink}
                >
                  <title>{tooltip}</title>
                </line>
                <line x1={corner3.x} y1={corner3.y} x2={to.x} y2={to.y} className="design-link-hit" onClick={selectLink} onDoubleClick={deleteLink}>
                  <title>{tooltip}</title>
                </line>
                {selected && (
                  <>
                    <circle
                      cx={corner1.x}
                      cy={corner1.y}
                      r={6}
                      className="design-link-corner design-link-corner-x"
                      style={{ fill: color }}
                      onMouseDown={(e) => handleBendMouseDown(e, link.id, "x")}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={deleteLink}
                    >
                      <title>Glisser pour déplacer horizontalement, double-cliquer pour supprimer</title>
                    </circle>
                    <circle
                      cx={corner2.x}
                      cy={corner2.y}
                      r={6}
                      className="design-link-corner design-link-corner-both"
                      style={{ fill: color }}
                      onMouseDown={(e) => handleBendMouseDown(e, link.id, "both")}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={deleteLink}
                    >
                      <title>Glisser pour déplacer horizontalement ou verticalement, double-cliquer pour supprimer</title>
                    </circle>
                    <circle
                      cx={corner3.x}
                      cy={corner3.y}
                      r={6}
                      className="design-link-corner design-link-corner-y"
                      style={{ fill: color }}
                      onMouseDown={(e) => handleBendMouseDown(e, link.id, "y")}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={deleteLink}
                    >
                      <title>Glisser pour déplacer verticalement, double-cliquer pour supprimer</title>
                    </circle>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
