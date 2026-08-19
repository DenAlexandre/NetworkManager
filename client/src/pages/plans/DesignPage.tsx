import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createEquipment, listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listPorts } from "../../api/ports";
import type { Port } from "../../api/ports";
import { createEquipmentLink, deleteEquipmentLink, listEquipmentLinks } from "../../api/equipmentLinks";
import type { EquipmentLink } from "../../api/equipmentLinks";
import { listApis } from "../../api/apis";
import type { Api } from "../../api/apis";
import { getDesignSchema, saveDesignSchema } from "../../api/designSchemas";
import { hardwareModelImageUrl } from "../../api/hardwareModels";
import { listAddressing } from "../../api/equipmentPortSettings";
import type { AddressingEquipment } from "../../api/equipmentPortSettings";
import { ApiError } from "../../api/client";
import { SimpleNameFormModal } from "../../components/SimpleNameFormModal";

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

interface LinkDraw {
  fromEquipmentId: number;
  fromPortId: number;
  from: { x: number; y: number };
  points: { x: number; y: number }[];
}

// A link's custom path is stored as a list of waypoints relative to its parent port, in
// zoom-independent units (divide by zoom to store, multiply by zoom to render), so a hand-drawn
// route stays visually identical as the canvas is zoomed and moves rigidly with the start card.
type LinkPaths = Record<number, { dx: number; dy: number }[]>;

type Endpoints = Record<string, { x: number; y: number }>;
type Rect = { x: number; y: number; width: number; height: number };
type PortRects = Record<string, Rect>;
type CardRects = Record<number, Rect>;

interface Connection {
  ownPortLabel: string;
  otherEquipmentName: string;
  otherPortLabel: string;
  linkId: number;
  /** Set when the other side of this link belongs to a different API (or none at all) — the
      link crosses out of the tree being displayed, so it's rendered as a one-way pointer to that
      equipment instead of nested/bidirectional like an in-tree connection. */
  otherApiName?: string | null;
}

interface InfoTreeNode {
  equipment: Equipment;
  via?: { parentPortLabel: string; childPortLabel: string; linkId: number };
  /** Every link touching this equipment (any link type), minus the one already shown via `via` —
      an equipment only ever appears once in the tree, so every OTHER link it's part of (whether
      it lost out on nesting to a link found first, or is a fan-out ModBus link) must still be
      visible somewhere, or it would silently disappear from the panel. */
  connections: Connection[];
  children: InfoTreeNode[];
}

function endpointKey(equipmentId: number, portId: number) {
  return `${equipmentId}:${portId}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Cards are keyed by equipmentId in JSX (both the canvas and the info panel); a duplicate breaks
// React's reconciliation (refs/DOM nodes can get misattributed for every card after it), which is
// exactly what silently broke port clicks — the port rendered fine (driven by naturalSizes) but
// its endpoint was never computed (driven by imgRefs, which reconciliation had scrambled).
// Deduplicating defensively wherever cards are set makes that whole class of bug impossible.
function dedupeCardsByEquipmentId(cards: Card[]): Card[] {
  const seen = new Set<number>();
  return cards.filter((c) => {
    if (seen.has(c.equipmentId)) return false;
    seen.add(c.equipmentId);
    return true;
  });
}

// Axis-aligned segment vs. axis-aligned rect: for a purely horizontal or vertical segment, a
// simple bounding-box overlap test is exact (the segment's zero-width axis collapses to a
// point-in-range check, the other axis to a range overlap).
function segmentIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, rect: Rect) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return minX <= rect.x + rect.width && maxX >= rect.x && minY <= rect.y + rect.height && maxY >= rect.y;
}

// The rendered link path is always a horizontal/vertical/horizontal (/vertical) elbow through
// (midX, from.y) and (midX, midY) — see the polyline rendering below.
function elbowHitsObstacles(
  from: { x: number; y: number },
  to: { x: number; y: number },
  midX: number,
  midY: number,
  obstacles: Rect[]
) {
  const corner1 = { x: midX, y: from.y };
  const corner2 = { x: midX, y: midY };
  const corner3 = { x: to.x, y: midY };
  const segments: [{ x: number; y: number }, { x: number; y: number }][] = [
    [from, corner1],
    [corner1, corner2],
    [corner2, corner3],
    [corner3, to],
  ];
  return obstacles.some((rect) => segments.some(([a, b]) => segmentIntersectsRect(a, b, rect)));
}

const AUTO_ROUTE_RATIOS = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9, 0.05, 0.95];
const AUTO_ROUTE_Y_OFFSETS = [0, -40, 40, -80, 80, -140, 140, -220, 220];

// Picks a bend point (midX on the horizontal ratio between the two ports, midY as an offset from
// the child port) that keeps the elbow clear of every port rectangle it doesn't actually connect
// to, so a link routed between two cards doesn't visually appear to terminate on an unrelated
// port in between. Falls back to the plain default (ratio 0.5, no Y offset) if nothing is clear.
function findAutoRoute(from: { x: number; y: number }, to: { x: number; y: number }, obstacles: Rect[], zoom: number) {
  const defaultMidX = from.x + 0.5 * (to.x - from.x);
  if (obstacles.length === 0) return { midX: defaultMidX, midY: to.y };
  for (const yOffset of AUTO_ROUTE_Y_OFFSETS) {
    const midY = to.y + yOffset * zoom;
    for (const ratio of AUTO_ROUTE_RATIOS) {
      const midX = from.x + ratio * (to.x - from.x);
      if (!elbowHitsObstacles(from, to, midX, midY, obstacles)) return { midX, midY };
    }
  }
  return { midX: defaultMidX, midY: to.y };
}

// Inkscape-style ortho constraint for the manual link-drawing mode: snaps the free point to a
// horizontal or vertical line from the anchor, picking whichever axis has the larger cursor delta.
function orthoConstrain(anchor: { x: number; y: number }, cursor: { x: number; y: number }) {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: cursor.x, y: anchor.y } : { x: anchor.x, y: cursor.y };
}

// Remembers which API was last being worked on so it's restored automatically after navigating
// away and back (the component unmounts, losing all React state, on every route change).
const SELECTED_API_STORAGE_KEY = "design.selectedApiId";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1;
const ZOOM_STEP = 0.05;

const DEFAULT_CARD_WIDTH = 190;
const MIN_CARD_WIDTH = 120;
const MAX_CARD_WIDTH = 480;

// Length (in zoom-independent units, like a hand-drawn link's waypoints) of the stub arrow drawn
// for a link whose other end isn't on the current canvas — long enough to read clearly as a
// distinct arrow rather than a stray mark next to the port.
const EXTERNAL_ARROW_LENGTH = 56;

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
  const navigate = useNavigate();
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [allPorts, setAllPorts] = useState<Port[]>([]);
  const [links, setLinks] = useState<EquipmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cards, setCards] = useState<Card[]>([]);
  const [addEquipmentId, setAddEquipmentId] = useState<number | "">("");
  const [searchApiId, setSearchApiId] = useState<number | "">("");
  const [searchRoomId, setSearchRoomId] = useState<number | "">("");
  const [searchDeviceTypeId, setSearchDeviceTypeId] = useState<number | "">("");
  const [searchHardwareModelId, setSearchHardwareModelId] = useState<number | "">("");
  const [linkMode, setLinkMode] = useState(false);
  const [linkDraw, setLinkDraw] = useState<LinkDraw | null>(null);
  const [cardContextMenu, setCardContextMenu] = useState<{ equipmentId: number; x: number; y: number } | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<Equipment | null>(null);
  const [linkPreview, setLinkPreview] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{ equipmentId: number; startX: number; startWidth: number } | null>(null);

  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [resizingText, setResizingText] = useState<{ id: number; startX: number; startFontSize: number } | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoints>({});
  const [portRects, setPortRects] = useState<PortRects>({});
  const [cardRects, setCardRects] = useState<CardRects>({});
  const [naturalSizes, setNaturalSizes] = useState<Record<number, { width: number; height: number }>>({});
  // Legacy single-bend data from schemas saved before free-form tracing: read-only, used as a
  // rendering fallback for links that have no entry in linkPaths (never written to anymore).
  const [bendOverrides, setBendOverrides] = useState<Record<number, number>>({});
  const [bendYOverrides, setBendYOverrides] = useState<Record<number, number>>({});
  const [linkPaths, setLinkPaths] = useState<LinkPaths>({});
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());
  const [selectedTextIds, setSelectedTextIds] = useState<Set<number>>(new Set());
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(new Set());
  const [waypointDrag, setWaypointDrag] = useState<{ linkId: number; index: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  // Group drag: moves every selected card/text block together, preserving their relative
  // offsets. Started from any selected card's or text block's header; "cards"/"texts" hold each
  // one's position at drag-start so movement on each mousemove is computed as a delta from
  // startX/startY rather than accumulated incrementally.
  const [groupDrag, setGroupDrag] = useState<{
    startX: number;
    startY: number;
    cards: Record<number, { x: number; y: number }>;
    texts: Record<number, { x: number; y: number }>;
  } | null>(null);

  // Rubber-band selection: marqueeStart is the fixed anchor point (unzoomed canvas coordinates)
  // set on mousedown; marqueeRect is the live normalized rectangle used both to render the
  // selection box and, on mouseup, to hit-test cards/text blocks/links.
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const [apis, setApis] = useState<Api[]>([]);
  const [selectedApiId, setSelectedApiId] = useState<number | "">("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addressing, setAddressing] = useState<AddressingEquipment[]>([]);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  // Tree nodes (one per equipment on the schema) are expanded by default; this only tracks the
  // exceptions a user has explicitly collapsed, same convention as SitesTree/EquipmentLinksTree.
  const [collapsedInfoEquipmentIds, setCollapsedInfoEquipmentIds] = useState<Set<number>>(new Set());

  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const hasRestoredSavedApi = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchAllData() {
    const [eqRes, portsRes, linksRes, apisRes, addressingRes] = await Promise.all([
      listEquipment(),
      listPorts(),
      listEquipmentLinks(),
      listApis(),
      listAddressing(),
    ]);
    setEquipmentList(eqRes.equipment);
    setAllPorts(portsRes.ports);
    setLinks(linksRes.links);
    setApis(apisRes.apis);
    setAddressing(addressingRes.equipment);
  }

  useEffect(() => {
    fetchAllData()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  // Re-fetches equipment/ports/links/APIs/addressing without touching the canvas layout, so the
  // arrows/connections (in particular the cross-API "→ equipment (API)" pointers in the info
  // panel, which reflect other equipment's apiId) pick up changes made elsewhere in the app since
  // this page loaded, without losing unsaved card positions or hand-drawn link paths.
  async function handleRefreshData() {
    setRefreshing(true);
    setError(null);
    try {
      await fetchAllData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'actualisation.");
    } finally {
      setRefreshing(false);
    }
  }

  // Runs once the initial data load has landed (so `apis` is populated and `handleSelectApi`'s
  // closure over `equipmentList` isn't stale), restoring whichever API was last worked on.
  useEffect(() => {
    if (hasRestoredSavedApi.current || loading) return;
    hasRestoredSavedApi.current = true;
    const saved = Number(localStorage.getItem(SELECTED_API_STORAGE_KEY));
    if (saved && apis.some((a) => a.id === saved)) {
      handleSelectApi(String(saved));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, apis]);

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

  const addressingByEquipmentId = useMemo(
    () => new Map(addressing.map((a) => [a.equipmentId, a])),
    [addressing]
  );

  // Hierarchy for the info panel: only equipment belonging to the selected API, rooted at
  // whichever piece is flagged "Point de départ API" (the actual gateway in this network), with
  // every other equipment nested under its parent link — mirroring the real topology instead of a
  // flat list.
  // Falls back to alphabetical, then to raising anything a cycle would otherwise hide, so nothing
  // silently disappears. ModBus links don't drive that same chain-of-custody nesting (a bus port
  // can fan out to many others, so there's no real one-hop parent/child to reflect the way a
  // point-to-point Fibre/TCP-IP cable has) — instead, every equipment on the same ModBus network
  // (chained or not) is grouped one level deep under whichever member is never itself a ModBus
  // child, e.g. all the AEG* units sit directly under API 2-406A-HQ regardless of how many ModBus
  // hops actually separate them. Every piece of equipment is placed in the tree exactly once (an
  // equipment linked from more than one parent — e.g. a switch uplinked to two others — would
  // otherwise get built as a separate subtree under each one); any link that lost out on nesting
  // that way, plus every ModBus link, still shows up via `connections` on whichever single node
  // instance exists, so no link is ever silently dropped from view.
  const infoTree = useMemo(() => {
    if (selectedApiId === "") return [] as InfoTreeNode[];
    const apiEquipment = equipmentList.filter((e) => e.apiId === selectedApiId);
    const apiEquipmentIds = new Set(apiEquipment.map((e) => e.id));
    const apiEquipmentLinks = links.filter(
      (l) => apiEquipmentIds.has(l.parentEquipmentId) && apiEquipmentIds.has(l.childEquipmentId)
    );
    const modbusLinks = apiEquipmentLinks.filter((l) => portsById.get(l.parentPortId)?.portType === "ModBus");
    const apiLinks = apiEquipmentLinks.filter((l) => portsById.get(l.parentPortId)?.portType !== "ModBus");

    const connectionsByEquipment = new Map<number, Connection[]>();
    for (const l of apiEquipmentLinks) {
      const parentList = connectionsByEquipment.get(l.parentEquipmentId) ?? [];
      parentList.push({
        ownPortLabel: l.parentPortLabel,
        otherEquipmentName: l.childEquipmentName,
        otherPortLabel: l.childPortLabel,
        linkId: l.id,
      });
      connectionsByEquipment.set(l.parentEquipmentId, parentList);
      const childList = connectionsByEquipment.get(l.childEquipmentId) ?? [];
      childList.push({
        ownPortLabel: l.childPortLabel,
        otherEquipmentName: l.parentEquipmentName,
        otherPortLabel: l.parentPortLabel,
        linkId: l.id,
      });
      connectionsByEquipment.set(l.childEquipmentId, childList);
    }

    // Links where only one side belongs to this API still need to show up on that side — as a
    // one-way pointer to the other equipment (and its API), not nested into this tree, since the
    // other equipment's own subtree lives under a different API's schema entirely.
    for (const l of links) {
      const parentInApi = apiEquipmentIds.has(l.parentEquipmentId);
      const childInApi = apiEquipmentIds.has(l.childEquipmentId);
      if (parentInApi === childInApi) continue;
      const [ownId, ownPortLabel, otherId, otherPortLabel] = parentInApi
        ? [l.parentEquipmentId, l.parentPortLabel, l.childEquipmentId, l.childPortLabel]
        : [l.childEquipmentId, l.childPortLabel, l.parentEquipmentId, l.parentPortLabel];
      const list = connectionsByEquipment.get(ownId) ?? [];
      list.push({
        ownPortLabel,
        otherEquipmentName: equipmentById.get(otherId)?.name ?? "?",
        otherPortLabel,
        linkId: l.id,
        otherApiName: equipmentById.get(otherId)?.apiName ?? null,
      });
      connectionsByEquipment.set(ownId, list);
    }

    // Union-find over the ModBus subgraph only, to group every equipment on the same bus/chain
    // together regardless of how many hops apart they actually are.
    const ufParent = new Map<number, number>();
    function find(id: number): number {
      let root = id;
      while (ufParent.has(root) && ufParent.get(root) !== root) root = ufParent.get(root)!;
      let cur = id;
      while (ufParent.has(cur) && ufParent.get(cur) !== root) {
        const next = ufParent.get(cur)!;
        ufParent.set(cur, root);
        cur = next;
      }
      return root;
    }
    function union(a: number, b: number) {
      if (!ufParent.has(a)) ufParent.set(a, a);
      if (!ufParent.has(b)) ufParent.set(b, b);
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) ufParent.set(ra, rb);
    }
    for (const l of modbusLinks) union(l.parentEquipmentId, l.childEquipmentId);

    const modbusChildIds = new Set(modbusLinks.map((l) => l.childEquipmentId));
    const componentMembers = new Map<number, number[]>();
    for (const id of ufParent.keys()) {
      const root = find(id);
      const list = componentMembers.get(root) ?? [];
      list.push(id);
      componentMembers.set(root, list);
    }
    const modbusChildrenByDisplayRoot = new Map<number, number[]>();
    const nonRootModbusMemberIds = new Set<number>();
    for (const members of componentMembers.values()) {
      const candidates = members
        .filter((id) => !modbusChildIds.has(id))
        .sort((a, b) => (equipmentById.get(a)?.name ?? "").localeCompare(equipmentById.get(b)?.name ?? ""));
      const displayRoot = candidates[0] ?? [...members].sort((a, b) =>
        (equipmentById.get(a)?.name ?? "").localeCompare(equipmentById.get(b)?.name ?? "")
      )[0];
      const others = members
        .filter((id) => id !== displayRoot)
        .sort((a, b) => (equipmentById.get(a)?.name ?? "").localeCompare(equipmentById.get(b)?.name ?? ""));
      modbusChildrenByDisplayRoot.set(displayRoot, others);
      for (const id of others) nonRootModbusMemberIds.add(id);
    }

    const childLinksByParent = new Map<number, EquipmentLink[]>();
    for (const l of apiLinks) {
      const list = childLinksByParent.get(l.parentEquipmentId) ?? [];
      list.push(l);
      childLinksByParent.set(l.parentEquipmentId, list);
    }
    const childEquipmentIds = new Set(apiLinks.map((l) => l.childEquipmentId));
    const visited = new Set<number>();

    function buildNode(
      equipmentId: number,
      ancestors: Set<number>,
      via?: { parentPortLabel: string; childPortLabel: string; linkId: number }
    ): InfoTreeNode | null {
      if (visited.has(equipmentId)) return null;
      const equipment = equipmentById.get(equipmentId);
      if (!equipment) return null;
      visited.add(equipmentId);
      const children: InfoTreeNode[] = [];
      for (const l of childLinksByParent.get(equipmentId) ?? []) {
        if (ancestors.has(l.childEquipmentId)) continue;
        const childNode = buildNode(l.childEquipmentId, new Set(ancestors).add(l.childEquipmentId), {
          parentPortLabel: l.parentPortLabel,
          childPortLabel: l.childPortLabel,
          linkId: l.id,
        });
        if (childNode) children.push(childNode);
      }
      for (const memberId of modbusChildrenByDisplayRoot.get(equipmentId) ?? []) {
        if (ancestors.has(memberId)) continue;
        const memberNode = buildNode(memberId, new Set(ancestors).add(memberId));
        if (memberNode) children.push(memberNode);
      }
      const connections = (connectionsByEquipment.get(equipmentId) ?? []).filter((c) => c.linkId !== via?.linkId);
      return { equipment, via, connections, children };
    }

    const roots = apiEquipment
      .filter((e) => !childEquipmentIds.has(e.id) && !nonRootModbusMemberIds.has(e.id))
      .sort((a, b) => {
        if (a.isApiStartPoint !== b.isApiStartPoint) return a.isApiStartPoint ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const tree: InfoTreeNode[] = [];
    for (const root of roots) {
      const node = buildNode(root.id, new Set([root.id]));
      if (node) tree.push(node);
    }
    // Equipment never reached from a root (e.g. stuck in a link cycle) still needs to be shown.
    for (const e of apiEquipment) {
      if (visited.has(e.id)) continue;
      const node = buildNode(e.id, new Set([e.id]));
      if (node) tree.push(node);
    }
    return tree;
  }, [selectedApiId, equipmentList, links, equipmentById, portsById]);

  const linkedPortIds = useMemo(() => {
    const set = new Set<number>();
    for (const link of links) {
      set.add(link.parentPortId);
      set.add(link.childPortId);
    }
    return set;
  }, [links]);

  // Search filters for the "Ajouter un matériel" picker: unlike the info panel (scoped to
  // selectedApiId's own network), a schema can include equipment from any API/room/type, so the
  // picker searches the whole fleet rather than being restricted to the schema's API.
  const searchApiOptions = useMemo(
    () => [...apis].sort((a, b) => a.name.localeCompare(b.name)),
    [apis]
  );
  const searchRoomOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of equipmentList) map.set(e.roomId, `${e.zoneName} / ${e.roomName}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [equipmentList]);
  const searchDeviceTypeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of equipmentList) map.set(e.deviceTypeId, e.deviceType);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [equipmentList]);
  const searchHardwareModelOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of equipmentList) map.set(e.hardwareModelId, `${e.brandName} — ${e.hardwareModel}`);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [equipmentList]);

  const availableEquipment = useMemo(
    () =>
      selectedApiId === ""
        ? []
        : equipmentList
            .filter((e) => !cards.some((c) => c.equipmentId === e.id))
            .filter((e) => searchApiId === "" || e.apiId === searchApiId)
            .filter((e) => searchRoomId === "" || e.roomId === searchRoomId)
            .filter((e) => searchDeviceTypeId === "" || e.deviceTypeId === searchDeviceTypeId)
            .filter((e) => searchHardwareModelId === "" || e.hardwareModelId === searchHardwareModelId),
    [equipmentList, cards, selectedApiId, searchApiId, searchRoomId, searchDeviceTypeId, searchHardwareModelId]
  );

  function recomputeEndpoints() {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const next: Endpoints = {};
    const nextRects: PortRects = {};
    const nextCardRects: CardRects = {};
    for (const card of cards) {
      const cardEl = cardRefs.current[card.equipmentId];
      if (cardEl) {
        const cardElRect = cardEl.getBoundingClientRect();
        nextCardRects[card.equipmentId] = {
          x: cardElRect.left - canvasRect.left,
          y: cardElRect.top - canvasRect.top,
          width: cardElRect.width,
          height: cardElRect.height,
        };
      }
      const img = imgRefs.current[card.equipmentId];
      if (!img) continue;
      const imgRect = img.getBoundingClientRect();
      const equipment = equipmentById.get(card.equipmentId);
      if (!equipment) continue;
      const modelPorts = portsByModel.get(equipment.hardwareModelId) ?? [];
      if (!img.naturalWidth || !img.naturalHeight) continue;
      for (const p of modelPorts) {
        if (p.regionX === null || p.regionY === null || p.regionWidth === null || p.regionHeight === null) continue;
        const key = endpointKey(card.equipmentId, p.id);
        const rectX = imgRect.left - canvasRect.left + (p.regionX / img.naturalWidth) * imgRect.width;
        const rectY = imgRect.top - canvasRect.top + (p.regionY / img.naturalHeight) * imgRect.height;
        const rectWidth = (p.regionWidth / img.naturalWidth) * imgRect.width;
        const rectHeight = (p.regionHeight / img.naturalHeight) * imgRect.height;
        next[key] = { x: rectX + rectWidth / 2, y: rectY + rectHeight / 2 };
        nextRects[key] = { x: rectX, y: rectY, width: rectWidth, height: rectHeight };
      }
    }
    setPortRects(nextRects);
    setCardRects(nextCardRects);
    setEndpoints(next);
  }

  useLayoutEffect(() => {
    recomputeEndpoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, portsByModel, equipmentById, zoom]);

  useEffect(() => {
    if (!linkDraw) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLinkDraw(null);
        setLinkPreview(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [linkDraw]);

  // Tracks the live preview line while drawing a link. Listens on `window` (like every other
  // drag/track interaction below), not a React onMouseMove prop on the canvas element — a
  // React-scoped handler stops firing the instant the cursor crosses any sibling element that
  // happens to overlap the canvas visually (e.g. the floating info panel), since that sibling,
  // not the canvas, becomes the event target and the canvas is never an ancestor of it.
  useEffect(() => {
    if (!linkDraw) return;
    function onMove(e: MouseEvent) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect || !linkDraw) return;
      const cursor = { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top };
      const anchor = linkDraw.points[linkDraw.points.length - 1] ?? linkDraw.from;
      setLinkPreview(orthoConstrain(anchor, cursor));
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [linkDraw]);

  useEffect(() => {
    if (!cardContextMenu) return;
    function close() {
      setCardContextMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [cardContextMenu]);

  useEffect(() => {
    window.addEventListener("resize", recomputeEndpoints);
    return () => window.removeEventListener("resize", recomputeEndpoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, portsByModel, equipmentById]);

  useEffect(() => {
    if (!groupDrag) return;
    function onMove(e: MouseEvent) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect || !groupDrag) return;
      const x = (e.clientX - canvasRect.left) / zoom;
      const y = (e.clientY - canvasRect.top) / zoom;
      const dx = x - groupDrag.startX;
      const dy = y - groupDrag.startY;
      setCards((prev) =>
        prev.map((c) => {
          const start = groupDrag.cards[c.equipmentId];
          return start ? { ...c, x: start.x + dx, y: start.y + dy } : c;
        })
      );
      setTextBlocks((prev) =>
        prev.map((t) => {
          const start = groupDrag.texts[t.id];
          return start ? { ...t, x: start.x + dx, y: start.y + dy } : t;
        })
      );
    }
    function onUp() {
      setGroupDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [groupDrag, zoom]);

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

  useEffect(() => {
    if (!marqueeStart) return;
    function onMove(e: MouseEvent) {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect || !marqueeStart) return;
      const x = (e.clientX - canvasRect.left) / zoom;
      const y = (e.clientY - canvasRect.top) / zoom;
      setMarqueeRect({
        x: Math.min(marqueeStart.x, x),
        y: Math.min(marqueeStart.y, y),
        width: Math.abs(x - marqueeStart.x),
        height: Math.abs(y - marqueeStart.y),
      });
    }
    function onUp() {
      setMarqueeRect((rect) => {
        // Treat a near-zero-size drag as a plain click on empty canvas (selection was already
        // cleared on mousedown) rather than as an empty marquee that would do the same thing.
        if (rect && (rect.width > 4 || rect.height > 4)) applyMarqueeSelection(rect);
        return null;
      });
      setMarqueeStart(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marqueeStart, zoom]);

  function handleResizeMouseDown(e: ReactMouseEvent, card: Card) {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ equipmentId: card.equipmentId, startX: e.clientX, startWidth: card.width ?? DEFAULT_CARD_WIDTH });
  }

  // Snapshots the current x/y of every selected card and text block, used as the drag-start
  // reference point so group movement is computed as a delta rather than accumulated per event.
  function snapshotSelection(cardIds: Set<number>, textIds: Set<number>) {
    const cardsSnapshot: Record<number, { x: number; y: number }> = {};
    for (const id of cardIds) {
      const c = cards.find((cc) => cc.equipmentId === id);
      if (c) cardsSnapshot[id] = { x: c.x, y: c.y };
    }
    const textsSnapshot: Record<number, { x: number; y: number }> = {};
    for (const id of textIds) {
      const t = textBlocks.find((tt) => tt.id === id);
      if (t) textsSnapshot[id] = { x: t.x, y: t.y };
    }
    return { cardsSnapshot, textsSnapshot };
  }

  // Shared mousedown handler for both card and text-block headers: shift-click toggles the
  // object in/out of the current selection; a plain click on an object outside the current
  // selection replaces the selection with just that object; either way a group drag starts,
  // moving every currently-selected card/text block together.
  function beginObjectDrag(e: ReactMouseEvent, kind: "card" | "text", id: number) {
    e.stopPropagation();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const selected = kind === "card" ? selectedCardIds : selectedTextIds;
    const alreadySelected = selected.has(id);
    if (e.shiftKey) {
      const next = new Set(selected);
      if (alreadySelected) next.delete(id);
      else next.add(id);
      if (kind === "card") setSelectedCardIds(next);
      else setSelectedTextIds(next);
      setSelectedLinkIds(new Set());
      return;
    }
    let cardIds = selectedCardIds;
    let textIds = selectedTextIds;
    if (!alreadySelected) {
      cardIds = kind === "card" ? new Set([id]) : new Set();
      textIds = kind === "text" ? new Set([id]) : new Set();
      setSelectedCardIds(cardIds);
      setSelectedTextIds(textIds);
      setSelectedLinkIds(new Set());
    }
    const startX = (e.clientX - canvasRect.left) / zoom;
    const startY = (e.clientY - canvasRect.top) / zoom;
    const { cardsSnapshot, textsSnapshot } = snapshotSelection(cardIds, textIds);
    setGroupDrag({ startX, startY, cards: cardsSnapshot, texts: textsSnapshot });
  }

  function handleTextHeaderMouseDown(e: ReactMouseEvent, block: TextBlock) {
    beginObjectDrag(e, "text", block.id);
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
    if (!waypointDrag) return;
    function onMove(e: MouseEvent) {
      const canvasEl = canvasRef.current;
      const canvasRect = canvasEl?.getBoundingClientRect();
      if (!canvasEl || !canvasRect || !waypointDrag) return;
      const link = links.find((l) => l.id === waypointDrag.linkId);
      if (!link) return;
      const from = endpoints[endpointKey(link.parentEquipmentId, link.parentPortId)];
      if (!from) return;
      const x = clamp(e.clientX - canvasRect.left, 0, canvasEl.scrollWidth);
      const y = clamp(e.clientY - canvasRect.top, 0, canvasEl.scrollHeight);
      const dx = (x - from.x) / zoom;
      const dy = (y - from.y) / zoom;
      setLinkPaths((prev) => {
        const path = [...(prev[waypointDrag.linkId] ?? [])];
        path[waypointDrag.index] = { dx, dy };
        return { ...prev, [waypointDrag.linkId]: path };
      });
    }
    function onUp() {
      setWaypointDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [waypointDrag, links, endpoints, zoom]);

  // The very first drag of a waypoint on a link that has no explicit path yet (legacy
  // bend-based or freshly auto-routed) "bakes in" whatever is currently rendered as an editable
  // path, so dragging always feels like moving a real point rather than jumping unexpectedly.
  function handleWaypointMouseDown(
    e: ReactMouseEvent,
    linkId: number,
    index: number,
    currentPoints: { x: number; y: number }[],
    from: { x: number; y: number }
  ) {
    e.stopPropagation();
    if (!(linkId in linkPaths)) {
      setLinkPaths((prev) => ({
        ...prev,
        [linkId]: currentPoints.map((p) => ({ dx: (p.x - from.x) / zoom, dy: (p.y - from.y) / zoom })),
      }));
    }
    setWaypointDrag({ linkId, index });
  }

  async function loadLinks() {
    try {
      const { links } = await listEquipmentLinks();
      setLinks(links);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    }
  }

  // Keeps the "Ajouter un matériel" selection valid as the search filters (or the set of
  // equipment already on the canvas) narrow the result list out from under it.
  useEffect(() => {
    if (addEquipmentId !== "" && !availableEquipment.some((e) => e.id === addEquipmentId)) setAddEquipmentId("");
  }, [availableEquipment, addEquipmentId]);

  function handleAddCard() {
    if (addEquipmentId === "") return;
    const newEquipmentId = Number(addEquipmentId);
    setCards((prev) => {
      if (prev.some((c) => c.equipmentId === newEquipmentId)) return prev;
      return [
        ...prev,
        { equipmentId: newEquipmentId, x: 40 + (prev.length % 4) * 260, y: 40 + Math.floor(prev.length / 4) * 300 },
      ];
    });
    setAddEquipmentId("");
  }

  function handleRemoveCard(equipmentId: number) {
    setCards((prev) => prev.filter((c) => c.equipmentId !== equipmentId));
    if (linkDraw?.fromEquipmentId === equipmentId) {
      setLinkDraw(null);
      setLinkPreview(null);
    }
    setSelectedCardIds((prev) => {
      if (!prev.has(equipmentId)) return prev;
      const next = new Set(prev);
      next.delete(equipmentId);
      return next;
    });
  }

  function handleCardContextMenu(e: ReactMouseEvent, equipmentId: number) {
    e.preventDefault();
    e.stopPropagation();
    if (linkMode) return;
    setCardContextMenu({ equipmentId, x: e.clientX, y: e.clientY });
  }

  function handleContextMenuRemove() {
    if (!cardContextMenu) return;
    handleRemoveCard(cardContextMenu.equipmentId);
    setCardContextMenu(null);
  }

  function handleContextMenuEdit() {
    if (!cardContextMenu) return;
    navigate(`/equipment?open=${cardContextMenu.equipmentId}&returnTo=/plans`);
    setCardContextMenu(null);
  }

  function handleContextMenuAddress() {
    if (!cardContextMenu) return;
    navigate(`/equipment/addressing?open=${cardContextMenu.equipmentId}&returnTo=/plans`);
    setCardContextMenu(null);
  }

  function handleContextMenuDuplicate() {
    if (!cardContextMenu) return;
    const equipment = equipmentById.get(cardContextMenu.equipmentId);
    setCardContextMenu(null);
    if (equipment) setDuplicateSource(equipment);
  }

  async function handleSaveDuplicate(name: string) {
    if (!duplicateSource) return;
    const { equipment } = await createEquipment({
      roomId: duplicateSource.roomId,
      deviceTypeId: duplicateSource.deviceTypeId,
      hardwareModelId: duplicateSource.hardwareModelId,
      apiId: duplicateSource.apiId,
      name,
      isApiStartPoint: false,
    });
    setEquipmentList((prev) => [...prev, equipment]);
    // Places the duplicate right next to the original's card, if it's on this canvas.
    const originalCard = cards.find((c) => c.equipmentId === duplicateSource.id);
    setCards((prev) => {
      if (prev.some((c) => c.equipmentId === equipment.id)) return prev;
      return [
        ...prev,
        {
          equipmentId: equipment.id,
          x: (originalCard?.x ?? 40) + 30,
          y: (originalCard?.y ?? 40) + 30,
          width: originalCard?.width,
        },
      ];
    });
  }

  function handleHeaderMouseDown(e: ReactMouseEvent, card: Card) {
    beginObjectDrag(e, "card", card.equipmentId);
  }

  function handleZoomChange(next: number) {
    setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM));
  }

  function handleToggleLinkMode() {
    setLinkMode((prev) => !prev);
    setLinkDraw(null);
    setLinkPreview(null);
  }

  // Selects everything (cards, text blocks, links) whose canvas position falls inside the
  // rubber-banded rectangle. Card hit-testing uses the rendered DOM box (accounts for content
  // height, not just the stored width); link hit-testing requires both endpoints inside the
  // rectangle, since a link has no position of its own beyond the two ports it connects.
  function applyMarqueeSelection(rect: { x: number; y: number; width: number; height: number }) {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;

    const cardIds = new Set<number>();
    for (const card of cards) {
      const el = cardRefs.current[card.equipmentId];
      let cLeft = card.x;
      let cTop = card.y;
      let cRight = card.x + (card.width ?? DEFAULT_CARD_WIDTH);
      let cBottom = card.y + 40;
      if (el) {
        const r = el.getBoundingClientRect();
        cLeft = (r.left - canvasRect.left) / zoom;
        cTop = (r.top - canvasRect.top) / zoom;
        cRight = (r.right - canvasRect.left) / zoom;
        cBottom = (r.bottom - canvasRect.top) / zoom;
      }
      if (cLeft < right && cRight > left && cTop < bottom && cBottom > top) cardIds.add(card.equipmentId);
    }

    const textIds = new Set<number>();
    for (const block of textBlocks) {
      const size = textBlockSize(block);
      const bLeft = block.x;
      const bTop = block.y;
      const bRight = block.x + size.width;
      const bBottom = block.y + size.height;
      if (bLeft < right && bRight > left && bTop < bottom && bBottom > top) textIds.add(block.id);
    }

    const linkIds = new Set<number>();
    for (const { link, from, to, points } of visibleLinks) {
      // endpoints/waypoints are stored in already-zoomed canvas pixels; convert back to the
      // unzoomed layer space the marquee rectangle is expressed in. The whole path (both ports
      // plus every waypoint) must fall inside the rectangle for the link to be selected.
      const allInside = [from, ...points, to].every((p) => {
        const x = p.x / zoom;
        const y = p.y / zoom;
        return x >= left && x <= right && y >= top && y <= bottom;
      });
      if (allInside) linkIds.add(link.id);
    }

    setSelectedCardIds(cardIds);
    setSelectedTextIds(textIds);
    setSelectedLinkIds(linkIds);
  }

  function handleCanvasMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    if (linkDraw) {
      // A click anywhere on the canvas (not on a port) adds a new waypoint, constrained
      // horizontal/vertical from the last placed point (Inkscape ortho line-tool style).
      const cursor = { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top };
      const anchor = linkDraw.points[linkDraw.points.length - 1] ?? linkDraw.from;
      const point = orthoConstrain(anchor, cursor);
      setLinkDraw({ ...linkDraw, points: [...linkDraw.points, point] });
      setLinkPreview(point);
      return;
    }

    const x = (e.clientX - canvasRect.left) / zoom;
    const y = (e.clientY - canvasRect.top) / zoom;
    if (!e.shiftKey) {
      setSelectedCardIds(new Set());
      setSelectedTextIds(new Set());
      setSelectedLinkIds(new Set());
    }
    setMarqueeStart({ x, y });
    setMarqueeRect({ x, y, width: 0, height: 0 });
  }


  async function handlePortMouseDown(e: ReactMouseEvent, equipmentId: number, portId: number) {
    e.stopPropagation();
    if (!linkMode) return;
    const portPosition = endpoints[endpointKey(equipmentId, portId)];

    if (!linkDraw) {
      if (!portPosition) return;
      setLinkDraw({ fromEquipmentId: equipmentId, fromPortId: portId, from: portPosition, points: [] });
      setLinkPreview(portPosition);
      return;
    }
    if (linkDraw.fromEquipmentId === equipmentId && linkDraw.fromPortId === portId) {
      setLinkDraw(null);
      setLinkPreview(null);
      return;
    }
    if (linkDraw.fromEquipmentId === equipmentId) {
      if (!portPosition) return;
      setLinkDraw({ fromEquipmentId: equipmentId, fromPortId: portId, from: portPosition, points: [] });
      setLinkPreview(portPosition);
      return;
    }

    const from = linkDraw;
    const to = portPosition;
    setLinkDraw(null);
    setLinkPreview(null);
    if (!to) return;
    setError(null);
    try {
      const { link } = await createEquipmentLink({
        parentEquipmentId: from.fromEquipmentId,
        parentPortId: from.fromPortId,
        childEquipmentId: equipmentId,
        childPortId: portId,
      });
      // Every waypoint the user actually clicked is already ortho-constrained relative to the
      // previous one (see handleCanvasMouseDown) — but the very last segment, into the destination
      // port itself, was never constrained since that click selects a port, not a canvas point.
      // Add one final ortho corner there too, unless the last point already lines up with the
      // port on one axis, so the whole path (including a direct port-to-port click) is always
      // strictly horizontal/vertical, never diagonal.
      const lastAnchor = from.points[from.points.length - 1] ?? from.from;
      const needsFinalCorner = lastAnchor.x !== to.x && lastAnchor.y !== to.y;
      const points = needsFinalCorner ? [...from.points, orthoConstrain(lastAnchor, to)] : from.points;
      const path = points.map((p) => ({ dx: (p.x - from.from.x) / zoom, dy: (p.y - from.from.y) / zoom }));
      setLinkPaths((prev) => ({ ...prev, [link.id]: path }));
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
      setLinkPaths((prev) => {
        const next = { ...prev };
        delete next[linkId];
        return next;
      });
      setSelectedLinkIds((prev) => {
        if (!prev.has(linkId)) return prev;
        const next = new Set(prev);
        next.delete(linkId);
        return next;
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function toggleInfoEquipmentCollapse(equipmentId: number) {
    setCollapsedInfoEquipmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(equipmentId)) next.delete(equipmentId);
      else next.add(equipmentId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedCardIds(new Set());
    setSelectedTextIds(new Set());
    setSelectedLinkIds(new Set());
  }

  async function handleSelectApi(value: string) {
    const apiId = value ? Number(value) : "";
    setSelectedApiId(apiId);
    setLinkDraw(null);
    setLinkPreview(null);
    clearSelection();
    setAddEquipmentId("");
    setSearchApiId(apiId);
    setSearchRoomId("");
    setSearchDeviceTypeId("");
    setSearchHardwareModelId("");
    if (apiId === "") {
      localStorage.removeItem(SELECTED_API_STORAGE_KEY);
      setCards([]);
      setBendOverrides({});
      setBendYOverrides({});
      setLinkPaths({});
      setTextBlocks([]);
      setZoom(1);
      return;
    }
    localStorage.setItem(SELECTED_API_STORAGE_KEY, String(apiId));
    setSchemaLoading(true);
    setError(null);
    try {
      const { schema } = await getDesignSchema(apiId);
      if (schema) {
        const validEquipmentIds = new Set(equipmentList.map((e) => e.id));
        setCards(dedupeCardsByEquipmentId(schema.layout.cards.filter((c) => validEquipmentIds.has(c.equipmentId))));
        setBendOverrides(schema.layout.bends ?? {});
        setBendYOverrides(schema.layout.bendsY ?? {});
        setLinkPaths(schema.layout.paths ?? {});
        setTextBlocks(schema.layout.textBlocks ?? []);
        setZoom(clamp(schema.layout.zoom ?? 1, MIN_ZOOM, MAX_ZOOM));
      } else {
        setCards([]);
        setBendOverrides({});
        setBendYOverrides({});
        setLinkPaths({});
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
      await saveDesignSchema(selectedApiId, {
        cards,
        bends: bendOverrides,
        bendsY: bendYOverrides,
        paths: linkPaths,
        zoom,
        textBlocks,
      });
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

        // Intermediate waypoints only (not from/to themselves), in priority order: an explicit
        // hand-drawn path always wins; a legacy single-bend schema still renders as before;
        // otherwise a single auto-avoided corner is derived, same as a fresh 2-click link.
        let points: { x: number; y: number }[];
        const explicitPath = linkPaths[l.id];
        if (explicitPath) {
          points = explicitPath.map((p) => ({ x: from.x + p.dx * zoom, y: from.y + p.dy * zoom }));
        } else if (l.id in bendOverrides || l.id in bendYOverrides) {
          const bendRatio = bendOverrides[l.id] ?? 0.5;
          const midX = from.x + bendRatio * (to.x - from.x);
          const bendYOffset = bendYOverrides[l.id] ?? 0;
          const midY = to.y + bendYOffset * zoom;
          points = [
            { x: midX, y: from.y },
            { x: midX, y: midY },
            { x: to.x, y: midY },
          ];
        } else {
          const ownKeys = new Set([
            endpointKey(l.parentEquipmentId, l.parentPortId),
            endpointKey(l.childEquipmentId, l.childPortId),
          ]);
          const obstacles = Object.entries(portRects)
            .filter(([key]) => !ownKeys.has(key))
            .map(([, rect]) => rect);
          const auto = findAutoRoute(from, to, obstacles, zoom);
          points = [
            { x: auto.midX, y: from.y },
            { x: auto.midX, y: auto.midY },
          ];
        }

        return {
          link: l,
          from,
          to,
          points,
          isCustomPath: !!explicitPath,
          color: parentPort?.linkTypeColor ?? "#8b5cf6",
          strokeWidth: parentPort?.linkTypeStrokeWidth ?? 3,
        };
      })
      .filter(
        (v): v is {
          link: EquipmentLink;
          from: { x: number; y: number };
          to: { x: number; y: number };
          points: { x: number; y: number }[];
          isCustomPath: boolean;
          color: string;
          strokeWidth: number;
        } => v !== null
      );
  }, [cards, links, endpoints, portRects, portsById, linkPaths, bendOverrides, bendYOverrides, zoom]);

  // Links where exactly one side is on the current canvas (the other equipment lives on a
  // different API's schema, or just hasn't been added here) are drawn as a short arrow pointing
  // away from the card through the port, in the same color/thickness as an in-schema link — a
  // visual cue on the canvas itself, complementing the cross-API pointer text in the info panel.
  const externalLinks = useMemo(() => {
    const onCanvas = new Set(cards.map((c) => c.equipmentId));
    const result: {
      linkId: number;
      from: { x: number; y: number };
      tip: { x: number; y: number };
      color: string;
      strokeWidth: number;
      label: string;
    }[] = [];
    for (const l of links) {
      const parentOn = onCanvas.has(l.parentEquipmentId);
      const childOn = onCanvas.has(l.childEquipmentId);
      if (parentOn === childOn) continue;
      const equipmentId = parentOn ? l.parentEquipmentId : l.childEquipmentId;
      const portId = parentOn ? l.parentPortId : l.childPortId;
      const ownPortLabel = parentOn ? l.parentPortLabel : l.childPortLabel;
      const otherEquipmentId = parentOn ? l.childEquipmentId : l.parentEquipmentId;
      const otherPortLabel = parentOn ? l.childPortLabel : l.parentPortLabel;
      const from = endpoints[endpointKey(equipmentId, portId)];
      const cardRect = cardRects[equipmentId];
      if (!from || !cardRect) continue;
      const centerX = cardRect.x + cardRect.width / 2;
      const centerY = cardRect.y + cardRect.height / 2;
      const rawDx = from.x - centerX;
      const rawDy = from.y - centerY;
      const dist = Math.hypot(rawDx, rawDy) || 1;
      const dx = rawDx / dist;
      const dy = rawDy / dist;
      const reach = EXTERNAL_ARROW_LENGTH * zoom;
      const tip = { x: from.x + dx * reach, y: from.y + dy * reach };
      const port = portsById.get(portId);
      const otherEquipment = equipmentById.get(otherEquipmentId);
      const otherLabel = otherEquipment
        ? otherEquipment.apiName
          ? `${otherEquipment.name} (${otherEquipment.apiName})`
          : `${otherEquipment.name} (sans API)`
        : "?";
      result.push({
        linkId: l.id,
        from,
        tip,
        color: port?.linkTypeColor ?? "#8b5cf6",
        strokeWidth: port?.linkTypeStrokeWidth ?? 3,
        label: `${ownPortLabel} → ${otherLabel} (${otherPortLabel})`,
      });
    }
    return result;
  }, [cards, links, endpoints, cardRects, portsById, equipmentById, zoom]);

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

      const linkGeoms = visibleLinks.map(({ from, to, points, color, strokeWidth }) => ({
        from,
        to,
        points,
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
        .concat(linkGeoms.flatMap((l) => [l.from.x, l.to.x, ...l.points.map((p) => p.x)]))
        .concat(textGeoms.flatMap((t) => [t.x, t.x + t.width]));
      const ys = cardGeoms
        .flatMap((c) => [c.y, c.y + c.height])
        .concat(linkGeoms.flatMap((l) => [l.from.y, l.to.y, ...l.points.map((p) => p.y)]))
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
        .map(({ from, to, points, color, strokeWidth }) => {
          const svgPoints = [from, ...points, to]
            .map(({ x, y }) => `${x + offsetX},${y + offsetY}`)
            .join(" ");
          return `<polyline points="${svgPoints}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />`;
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

  function renderInfoNode(node: InfoTreeNode) {
    const { equipment, via, connections, children } = node;
    const collapsed = collapsedInfoEquipmentIds.has(equipment.id);
    const addr = addressingByEquipmentId.get(equipment.id);
    const modelPorts = portsByModel.get(equipment.hardwareModelId) ?? [];
    const addressRows = modelPorts
      .map((port) => {
        const addressInfo = addr?.ports.find((p) => p.hardwareModelPortId === port.id);
        if (!addressInfo?.ipAddress && !addressInfo?.modbusAddress) return null;
        return { port, addressInfo };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    function selectViaLink(e: ReactMouseEvent) {
      e.stopPropagation();
      if (!via) return;
      setSelectedCardIds(new Set());
      setSelectedTextIds(new Set());
      setSelectedLinkIds(new Set([via.linkId]));
    }

    function selectConnectionLink(e: ReactMouseEvent, linkId: number) {
      e.stopPropagation();
      setSelectedCardIds(new Set());
      setSelectedTextIds(new Set());
      setSelectedLinkIds(new Set([linkId]));
    }

    return (
      <li key={equipment.id} className="design-info-tree-node">
        <div className="design-info-tree-row">
          <div className="design-info-tree-left">
            <button
              type="button"
              className="design-info-tree-toggle"
              onClick={() => toggleInfoEquipmentCollapse(equipment.id)}
              disabled={children.length === 0}
            >
              {children.length > 0 && (
                <span className={`design-info-tree-caret${collapsed ? "" : " open"}`}>▸</span>
              )}
              {equipment.name}
            </button>
            {via && (
              <span
                className={`design-info-tree-via${selectedLinkIds.has(via.linkId) ? " active" : ""}`}
                onClick={selectViaLink}
              >
                via {via.parentPortLabel} → {via.childPortLabel}
              </span>
            )}
            {connections.map((c) => (
              <span
                key={c.linkId}
                className={`design-info-tree-connection${c.otherApiName !== undefined ? " design-info-tree-connection-external" : ""}${selectedLinkIds.has(c.linkId) ? " active" : ""}`}
                onClick={(e) => selectConnectionLink(e, c.linkId)}
                title={c.otherApiName !== undefined ? `Liaison vers l'API ${c.otherApiName ?? "sans API"}` : "Liaison"}
              >
                {c.otherApiName !== undefined
                  ? `${c.ownPortLabel} → ${c.otherEquipmentName} (${c.otherApiName ?? "sans API"})`
                  : `${c.ownPortLabel} ↔ ${c.otherEquipmentName} (${c.otherPortLabel})`}
              </span>
            ))}
          </div>
          {addressRows.length > 0 && (
            <div className="design-info-tree-addr">
              {addressRows.map(({ port, addressInfo }) => (
                <span key={port.id} className="design-info-port-chip">
                  <span className="design-info-port-label">{port.label}</span>
                  {addressInfo?.ipAddress && (
                    <span className="design-info-port-detail">IP {addressInfo.ipAddress}</span>
                  )}
                  {addressInfo?.modbusAddress && (
                    <span className="design-info-port-detail">Modbus {addressInfo.modbusAddress}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        {!collapsed && children.length > 0 && (
          <ul className="design-info-tree-nested">{children.map((child) => renderInfoNode(child))}</ul>
        )}
      </li>
    );
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
            onClick={handleRefreshData}
            disabled={refreshing}
            title="Recharger le matériel, les ports et les liaisons pour mettre à jour le schéma et les flèches vers d'autres API"
          >
            {refreshing ? "Actualisation..." : "Actualiser"}
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
            value={searchApiId}
            onChange={(e) => setSearchApiId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Rechercher par API"
            disabled={selectedApiId === ""}
          >
            <option value="">Toutes les API</option>
            {searchApiOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={searchRoomId}
            onChange={(e) => setSearchRoomId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Rechercher par salle"
            disabled={selectedApiId === ""}
          >
            <option value="">Toutes les salles</option>
            {searchRoomOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={searchDeviceTypeId}
            onChange={(e) => setSearchDeviceTypeId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Rechercher par type"
            disabled={selectedApiId === ""}
          >
            <option value="">Tous les types</option>
            {searchDeviceTypeOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={searchHardwareModelId}
            onChange={(e) => setSearchHardwareModelId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Rechercher par matériel"
            disabled={selectedApiId === ""}
          >
            <option value="">Tous les matériels</option>
            {searchHardwareModelOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={addEquipmentId}
            onChange={(e) => setAddEquipmentId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Ajouter un matériel"
            disabled={selectedApiId === ""}
          >
            <option value="">{selectedApiId === "" ? "Sélectionnez d'abord une API..." : "Ajouter un matériel..."}</option>
            {availableEquipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.brandName} {e.hardwareModel} ({e.roomName}, {e.apiName ?? "sans API"})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={handleAddCard} disabled={addEquipmentId === ""}>
            + Ajouter
          </button>
        </div>

        <span className="design-toolbar-sep" />

        <div className="design-toolbar-group">
          <button
            type="button"
            className={linkMode ? "btn btn-sm" : "btn-outline btn-sm"}
            onClick={handleToggleLinkMode}
          >
            {linkMode ? "Mode liaison actif" : "Mode liaison"}
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

      {linkMode && !linkDraw && (
        <p className="muted">Mode liaison actif : cliquez sur un port pour démarrer une liaison.</p>
      )}
      {linkDraw && (
        <p className="muted">
          Cliquez sur le canevas pour ajouter des points de passage (contraints horizontal/vertical), ou directement
          sur le port d'arrivée pour terminer la liaison. Échap pour annuler.
        </p>
      )}

      <div className="design-canvas-outer">
      <div
        className={`design-canvas${linkMode ? " design-canvas-linkmode" : ""}`}
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
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
                className={`design-card${selectedCardIds.has(card.equipmentId) ? " selected" : ""}`}
                style={{ left: card.x, top: card.y, width: card.width ?? DEFAULT_CARD_WIDTH }}
                ref={(el) => {
                  cardRefs.current[card.equipmentId] = el;
                }}
                onContextMenu={(e) => handleCardContextMenu(e, card.equipmentId)}
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
                            linkDraw?.fromEquipmentId === card.equipmentId && linkDraw.fromPortId === p.id ? " selected" : ""
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
                className={`design-text-block${selectedTextIds.has(block.id) ? " selected" : ""}`}
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
          {marqueeRect && (
            <rect
              className="design-marquee"
              x={marqueeRect.x * zoom}
              y={marqueeRect.y * zoom}
              width={marqueeRect.width * zoom}
              height={marqueeRect.height * zoom}
            />
          )}
          {linkDraw && linkPreview && (
            <polyline
              className="design-link-preview"
              points={[linkDraw.from, ...linkDraw.points, linkPreview].map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              pointerEvents="none"
            />
          )}
          {visibleLinks.map(({ link, from, to, points, color, strokeWidth }) => {
            const path = [from, ...points, to];
            const tooltip = `${link.parentEquipmentName} (${link.parentPortLabel}) ↔ ${link.childEquipmentName} (${link.childPortLabel})`;
            const selected = selectedLinkIds.has(link.id);
            const showHandles = selected && selectedLinkIds.size === 1;
            function selectLink(e: ReactMouseEvent) {
              e.stopPropagation();
              if (e.shiftKey) {
                setSelectedLinkIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(link.id)) next.delete(link.id);
                  else next.add(link.id);
                  return next;
                });
                return;
              }
              setSelectedCardIds(new Set());
              setSelectedTextIds(new Set());
              setSelectedLinkIds(new Set([link.id]));
            }
            function deleteLink(e: ReactMouseEvent) {
              e.stopPropagation();
              handleDeleteLink(link.id);
            }
            return (
              <g key={link.id}>
                <polyline
                  className={selected ? "design-link-selected" : undefined}
                  points={path.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  pointerEvents="none"
                />
                {/* In link mode these invisible hit-lines (14px wide) would otherwise sit on top
                    of the DOM and swallow clicks meant for a port they happen to pass through or
                    end at — most noticeably a port that already has a link, since the path
                    necessarily terminates right on top of it. Disabled while drawing so every
                    port stays clickable; existing-link selection/deletion resumes once you leave
                    link mode. */}
                {path.slice(0, -1).map((point, i) => {
                  const next = path[i + 1];
                  return (
                    <line
                      key={i}
                      x1={point.x}
                      y1={point.y}
                      x2={next.x}
                      y2={next.y}
                      className="design-link-hit"
                      style={{ pointerEvents: linkMode ? "none" : "stroke" }}
                      onClick={selectLink}
                      onDoubleClick={deleteLink}
                    >
                      <title>{tooltip}</title>
                    </line>
                  );
                })}
                {showHandles &&
                  !linkMode &&
                  points.map((point, i) => (
                    <circle
                      key={i}
                      cx={point.x}
                      cy={point.y}
                      r={6}
                      className="design-link-corner design-link-corner-both"
                      style={{ fill: color }}
                      onMouseDown={(e) => handleWaypointMouseDown(e, link.id, i, points, from)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={deleteLink}
                    >
                      <title>Glisser pour déplacer, double-cliquer pour supprimer la liaison</title>
                    </circle>
                  ))}
              </g>
            );
          })}
          {externalLinks.map((e) => {
            const selected = selectedLinkIds.has(e.linkId);
            const arrowSize = Math.max(10, e.strokeWidth * 3);
            const dx = e.tip.x - e.from.x;
            const dy = e.tip.y - e.from.y;
            const len = Math.hypot(dx, dy) || 1;
            const dirX = dx / len;
            const dirY = dy / len;
            const perpX = -dirY;
            const perpY = dirX;
            const backX = e.tip.x - dirX * arrowSize;
            const backY = e.tip.y - dirY * arrowSize;
            const p1 = { x: backX + perpX * arrowSize * 0.55, y: backY + perpY * arrowSize * 0.55 };
            const p2 = { x: backX - perpX * arrowSize * 0.55, y: backY - perpY * arrowSize * 0.55 };
            function selectExternalLink(e2: ReactMouseEvent) {
              e2.stopPropagation();
              setSelectedCardIds(new Set());
              setSelectedTextIds(new Set());
              setSelectedLinkIds(new Set([e.linkId]));
            }
            return (
              <g key={`ext-${e.linkId}`}>
                <line
                  x1={e.from.x}
                  y1={e.from.y}
                  x2={backX}
                  y2={backY}
                  className={selected ? "design-link-selected" : undefined}
                  stroke={e.color}
                  strokeWidth={e.strokeWidth}
                  pointerEvents="none"
                />
                <polygon points={`${e.tip.x},${e.tip.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={e.color} pointerEvents="none" />
                <line
                  x1={e.from.x}
                  y1={e.from.y}
                  x2={e.tip.x}
                  y2={e.tip.y}
                  className="design-link-hit"
                  onClick={selectExternalLink}
                >
                  <title>{e.label}</title>
                </line>
              </g>
            );
          })}
        </svg>
      </div>

      <div className={`design-info-panel${infoPanelOpen ? " open" : ""}`}>
        <button
          type="button"
          className="design-info-panel-toggle"
          onClick={() => setInfoPanelOpen((prev) => !prev)}
          title={infoPanelOpen ? "Masquer le panneau d'informations" : "Afficher le panneau d'informations"}
        >
          {infoPanelOpen ? "Infos ✕" : "Infos ▾"}
        </button>
        {infoPanelOpen && (
          <div className="design-info-panel-body">
            <section>
              <h3>Matériel &amp; liaisons</h3>
              {selectedApiId === "" ? (
                <p className="muted">Sélectionnez une API pour voir son matériel.</p>
              ) : infoTree.length === 0 ? (
                <p className="muted">Aucun matériel pour cette API.</p>
              ) : (
                <ul className="design-info-tree">{infoTree.map((node) => renderInfoNode(node))}</ul>
              )}
            </section>
          </div>
        )}
      </div>
      </div>

      {cardContextMenu && (
        <div
          className="design-context-menu"
          style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={handleContextMenuEdit}>
            Modifier le matériel
          </button>
          <button type="button" onClick={handleContextMenuAddress}>
            Adresser le matériel
          </button>
          <button type="button" onClick={handleContextMenuDuplicate}>
            Dupliquer le matériel
          </button>
          <button type="button" className="danger" onClick={handleContextMenuRemove}>
            Supprimer du schéma
          </button>
        </div>
      )}

      {duplicateSource && (
        <SimpleNameFormModal
          title="Dupliquer le matériel"
          itemId={null}
          defaultName={`${duplicateSource.name} (copie)`}
          save={handleSaveDuplicate}
          onClose={() => setDuplicateSource(null)}
          onSaved={() => setDuplicateSource(null)}
        />
      )}
    </div>
  );
}
