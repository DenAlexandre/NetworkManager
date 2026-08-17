import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link } from "react-router-dom";
import { listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { clearPortRegion, listPorts, updatePortRegion } from "../../api/ports";
import type { Port } from "../../api/ports";
import { hardwareModelImageUrl } from "../../api/hardwareModels";
import { ApiError } from "../../api/client";

interface DraftRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function PortsDesignerPage() {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | "">("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRegionPortId, setSelectedRegionPortId] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DraftRegion | null>(null);
  const [pendingRegion, setPendingRegion] = useState<DraftRegion | null>(null);
  const [assignPortId, setAssignPortId] = useState<number | "">("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEquipment()
      .then(({ equipment }) => setEquipment(equipment))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));

    function setEquipment(equipment: Equipment[]) {
      setEquipmentList(equipment);
    }
  }, []);

  const selectedEquipment = useMemo(
    () => equipmentList.find((e) => e.id === selectedEquipmentId) ?? null,
    [equipmentList, selectedEquipmentId]
  );

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedEquipment]);

  useEffect(() => {
    setSelectedRegionPortId(null);
    setDraft(null);
    setPendingRegion(null);
    setZoom(1);
    setNaturalWidth(null);
    setNaturalHeight(null);
    if (!selectedEquipment) {
      setPorts([]);
      return;
    }
    listPorts()
      .then(({ ports: all }) => setPorts(all.filter((p) => p.hardwareModelId === selectedEquipment.hardwareModelId)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."));
  }, [selectedEquipment]);

  useEffect(() => {
    if (!pendingRegion) return;
    const unplaced = ports.find((p) => p.regionX === null);
    setAssignPortId(unplaced ? unplaced.id : (ports[0]?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRegion]);

  function percentPositionFromClient(clientX: number, clientY: number) {
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    // scrollWidth/scrollLeft are relative to the padding box, not the border box getBoundingClientRect
    // returns, so the border thickness must be subtracted to align both to the same origin.
    const originX = rect.left + stage.clientLeft;
    const originY = rect.top + stage.clientTop;
    return {
      x: clamp((((clientX - originX) + stage.scrollLeft) / stage.scrollWidth) * 100, 0, 100),
      y: clamp((((clientY - originY) + stage.scrollTop) / stage.scrollHeight) * 100, 0, 100),
    };
  }

  function handleZoomChange(next: number) {
    setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM));
  }

  function handleStageMouseDown(e: ReactMouseEvent) {
    if (pendingRegion) return;
    const pos = percentPositionFromClient(e.clientX, e.clientY);
    setDragStart(pos);
    setDraft({ x: pos.x, y: pos.y, width: 0, height: 0 });
  }

  useEffect(() => {
    if (!dragStart) return;
    function regionFromEvent(e: MouseEvent) {
      const pos = percentPositionFromClient(e.clientX, e.clientY);
      return {
        x: Math.min(dragStart!.x, pos.x),
        y: Math.min(dragStart!.y, pos.y),
        width: Math.abs(pos.x - dragStart!.x),
        height: Math.abs(pos.y - dragStart!.y),
      };
    }
    function onMove(e: MouseEvent) {
      setDraft(regionFromEvent(e));
    }
    function onUp(e: MouseEvent) {
      const region = regionFromEvent(e);
      setDragStart(null);
      setDraft(null);
      if (region.width < 1 || region.height < 1) return;
      setSelectedRegionPortId(null);
      setPendingRegion(region);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart]);

  async function handleConfirmAssign() {
    if (assignPortId === "" || !pendingRegion || !naturalWidth || !naturalHeight) return;
    setAssignSubmitting(true);
    setError(null);
    try {
      const { port } = await updatePortRegion(assignPortId, {
        regionX: (pendingRegion.x / 100) * naturalWidth,
        regionY: (pendingRegion.y / 100) * naturalHeight,
        regionWidth: (pendingRegion.width / 100) * naturalWidth,
        regionHeight: (pendingRegion.height / 100) * naturalHeight,
      });
      setPorts((prev) => prev.map((p) => (p.id === port.id ? port : p)));
      setPendingRegion(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement de la zone.");
    } finally {
      setAssignSubmitting(false);
    }
  }

  function handleCancelAssign() {
    setPendingRegion(null);
  }

  async function handleRemoveRegion(portId: number) {
    if (!window.confirm("Supprimer cette zone ?")) return;
    try {
      const { port } = await clearPortRegion(portId);
      setPorts((prev) => prev.map((p) => (p.id === port.id ? port : p)));
      if (selectedRegionPortId === portId) setSelectedRegionPortId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function selectRegion(e: ReactMouseEvent, portId: number) {
    if (pendingRegion) return;
    e.stopPropagation();
    setSelectedRegionPortId((prev) => (prev === portId ? null : portId));
  }

  const baseWidth = naturalWidth && containerWidth ? Math.min(naturalWidth, containerWidth) : naturalWidth;

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Gestion des ports</h2>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <label>
          Matériel
          <select
            value={selectedEquipmentId}
            onChange={(e) => setSelectedEquipmentId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Sélectionner...</option>
            {equipmentList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.brandName} {e.hardwareModel}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedEquipment && !selectedEquipment.hardwareModelImagePath && (
        <p className="muted">
          Ce modèle n'a pas d'image. Ajoutez-en une depuis{" "}
          <Link to="/data-types/hardware-models">Type des données → Matériel</Link>.
        </p>
      )}

      {selectedEquipment && selectedEquipment.hardwareModelImagePath && (
        <div className="ports-designer">
          <div className="ports-designer-main" ref={mainRef}>
            <p className="muted">Dessinez un rectangle sur la photo, puis choisissez à quel port l'associer.</p>
            <div className="ports-designer-zoom">
              <button
                type="button"
                className="btn-outline"
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
                className="btn-outline"
                onClick={() => handleZoomChange(zoom + ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
              >
                +
              </button>
              <span className="ports-designer-zoom-value">{Math.round(zoom * 100)}%</span>
              <button type="button" className="link" onClick={() => handleZoomChange(1)}>
                Réinitialiser
              </button>
            </div>
            <div className="ports-designer-stage-scroll" ref={stageRef} onMouseDown={handleStageMouseDown}>
              <div className="ports-designer-stage">
                <img
                  src={hardwareModelImageUrl(selectedEquipment.hardwareModelImagePath)}
                  alt={selectedEquipment.hardwareModel}
                  draggable={false}
                  onLoad={(e) => {
                    setNaturalWidth(e.currentTarget.naturalWidth);
                    setNaturalHeight(e.currentTarget.naturalHeight);
                  }}
                  style={baseWidth ? { width: baseWidth * zoom, maxWidth: "none" } : undefined}
                />
                {naturalWidth &&
                  naturalHeight &&
                  ports
                    .filter((p) => p.regionX !== null)
                    .map((p) => (
                      <div
                        key={p.id}
                        className={`port-region${selectedRegionPortId === p.id ? " selected" : ""}`}
                        style={{
                          left: `${(p.regionX! / naturalWidth) * 100}%`,
                          top: `${(p.regionY! / naturalHeight) * 100}%`,
                          width: `${(p.regionWidth! / naturalWidth) * 100}%`,
                          height: `${(p.regionHeight! / naturalHeight) * 100}%`,
                          borderColor: p.linkTypeColor,
                        }}
                        onMouseDown={(e) => selectRegion(e, p.id)}
                        title={p.label}
                      >
                        <span>{p.label}</span>
                      </div>
                    ))}
                {draft && (
                  <div
                    className="port-region draft"
                    style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.width}%`, height: `${draft.height}%` }}
                  />
                )}
                {pendingRegion && (
                  <div
                    className="port-region pending"
                    style={{
                      left: `${pendingRegion.x}%`,
                      top: `${pendingRegion.y}%`,
                      width: `${pendingRegion.width}%`,
                      height: `${pendingRegion.height}%`,
                    }}
                  />
                )}
              </div>
            </div>

            {pendingRegion && (
              <div className="ports-designer-assign inline-form">
                <label>
                  Associer au port
                  <select
                    value={assignPortId}
                    onChange={(e) => setAssignPortId(e.target.value ? Number(e.target.value) : "")}
                  >
                    {ports.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({p.portType}){p.regionX !== null ? " — déjà placé" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn" onClick={handleConfirmAssign} disabled={assignSubmitting || assignPortId === ""}>
                  Associer
                </button>
                <button type="button" className="btn-outline" onClick={handleCancelAssign}>
                  Annuler
                </button>
              </div>
            )}
          </div>

          <div className="ports-designer-list">
            <h3>Ports du modèle</h3>
            <ul className="ports-designer-port-list">
              {ports.map((p) => (
                <li key={p.id}>
                  <span className="port-region-swatch" style={{ background: p.linkTypeColor }} />
                  <span className="port-label">
                    {p.label} <small>({p.portType})</small>
                  </span>
                  {p.regionX !== null ? (
                    <button type="button" className="link danger" onClick={() => handleRemoveRegion(p.id)}>
                      Supprimer la zone
                    </button>
                  ) : (
                    <span className="muted">Non placé</span>
                  )}
                </li>
              ))}
            </ul>
            {ports.length === 0 && <p className="muted">Aucun port défini pour ce modèle.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
