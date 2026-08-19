import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { bulkCreatePorts, clearPortRegion, deletePort, listPorts, updatePort, updatePortRegion } from "../../api/ports";
import type { Port } from "../../api/ports";
import { hardwareModelImageUrl, listHardwareModels } from "../../api/hardwareModels";
import type { HardwareModel } from "../../api/hardwareModels";
import { listLinkTypes } from "../../api/linkTypes";
import type { LinkType } from "../../api/linkTypes";
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
  const [hardwareModelList, setHardwareModelList] = useState<HardwareModel[]>([]);
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<number | "">("");
  const [selectedHardwareModelId, setSelectedHardwareModelId] = useState<number | "">("");
  const [ports, setPorts] = useState<Port[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bulkLinkTypeId, setBulkLinkTypeId] = useState<number | "">("");
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [editingPortId, setEditingPortId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editLabelError, setEditLabelError] = useState<string | null>(null);

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
  const imgRef = useRef<HTMLImageElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    Promise.all([listHardwareModels(), listLinkTypes()])
      .then(([{ hardwareModels }, { linkTypes: ltList }]) => {
        setHardwareModelList(hardwareModels);
        setLinkTypes(ltList);
        if (ltList.length > 0) setBulkLinkTypeId(ltList[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  // Supports deep-linking here (e.g. from Type des données > Matériel's "Ports" column) via
  // /data-types/ports?hardwareModelId=<id>, preselecting that model once the list has loaded,
  // then stripping the query param so it doesn't reopen on refresh.
  useEffect(() => {
    const id = Number(searchParams.get("hardwareModelId"));
    if (!id || !hardwareModelList.some((m) => m.id === id)) return;
    setDeviceTypeFilter("");
    setSelectedHardwareModelId(id);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareModelList, searchParams, setSearchParams]);

  const selectedHardwareModel = useMemo(
    () => hardwareModelList.find((m) => m.id === selectedHardwareModelId) ?? null,
    [hardwareModelList, selectedHardwareModelId]
  );

  const deviceTypeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of hardwareModelList) {
      map.set(m.deviceTypeId, m.deviceType);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [hardwareModelList]);

  const filteredHardwareModelList = useMemo(() => {
    if (deviceTypeFilter === "") return hardwareModelList;
    return hardwareModelList.filter((m) => m.deviceTypeId === deviceTypeFilter);
  }, [hardwareModelList, deviceTypeFilter]);

  function handleDeviceTypeFilterChange(value: string) {
    const deviceTypeId = value ? Number(value) : "";
    setDeviceTypeFilter(deviceTypeId);
    if (
      deviceTypeId !== "" &&
      selectedHardwareModel &&
      selectedHardwareModel.deviceTypeId !== deviceTypeId
    ) {
      setSelectedHardwareModelId("");
    }
  }

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedHardwareModel]);

  async function loadPorts() {
    if (!selectedHardwareModel) return;
    try {
      const { ports: all } = await listPorts();
      setPorts(all.filter((p) => p.hardwareModelId === selectedHardwareModel.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    }
  }

  useEffect(() => {
    setSelectedRegionPortId(null);
    setDraft(null);
    setPendingRegion(null);
    setEditingPortId(null);
    setZoom(1);
    setNaturalWidth(null);
    setNaturalHeight(null);
    if (!selectedHardwareModel) {
      setPorts([]);
      return;
    }
    loadPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHardwareModel]);

  // The hardware model's photo is often already in the browser cache by the time this page opens
  // (e.g. its thumbnail was just shown on the Matériel list page the user linked from). When that
  // happens the <img> can already be "complete" once mounted, and the browser doesn't reliably
  // fire a fresh load event for it — leaving naturalWidth/Height stuck at the null the effect
  // above just reset them to, which makes the zoom slider look inert (nothing to size against).
  // This reads the already-loaded dimensions directly as a fallback for that case.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);
    }
  }, [selectedHardwareModel]);

  useEffect(() => {
    if (!pendingRegion) return;
    const unplaced = ports.find((p) => p.regionX === null);
    setAssignPortId(unplaced ? unplaced.id : (ports[0]?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRegion]);

  async function handleGeneratePorts(e: FormEvent) {
    e.preventDefault();
    if (bulkLinkTypeId === "" || !selectedHardwareModel) return;
    setBulkError(null);
    setBulkSubmitting(true);
    try {
      await bulkCreatePorts({
        hardwareModelId: selectedHardwareModel.id,
        linkTypeId: Number(bulkLinkTypeId),
        quantity: bulkQuantity,
      });
      await loadPorts();
    } catch (err) {
      setBulkError(err instanceof ApiError ? err.message : "Erreur lors de la génération.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  function startEditLabel(port: Port) {
    setEditingPortId(port.id);
    setEditingLabel(port.label);
    setEditLabelError(null);
  }

  function cancelEditLabel() {
    setEditingPortId(null);
  }

  async function handleSaveLabel(port: Port) {
    const label = editingLabel.trim();
    if (!label) return;
    setEditLabelError(null);
    try {
      const { port: updated } = await updatePort(port.id, {
        hardwareModelId: port.hardwareModelId,
        linkTypeId: port.linkTypeId,
        label,
      });
      setPorts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingPortId(null);
    } catch (err) {
      setEditLabelError(err instanceof ApiError ? err.message : "Erreur lors de la modification.");
    }
  }

  async function handleDeletePort(portId: number) {
    if (!window.confirm("Supprimer ce port ?")) return;
    try {
      await deletePort(portId);
      setPorts((prev) => prev.filter((p) => p.id !== portId));
      if (selectedRegionPortId === portId) setSelectedRegionPortId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

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
          Type de matériel
          <select value={deviceTypeFilter} onChange={(e) => handleDeviceTypeFilterChange(e.target.value)}>
            <option value="">Tous les types</option>
            {deviceTypeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Matériel
          <select
            value={selectedHardwareModelId}
            onChange={(e) => setSelectedHardwareModelId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Sélectionner...</option>
            {filteredHardwareModelList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.brandName} — {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedHardwareModel && (
        <div className="ports-designer">
          <div className="ports-designer-main" ref={mainRef}>
            {!selectedHardwareModel.imagePath ? (
              <p className="muted">
                Ce modèle n'a pas d'image. Ajoutez-en une depuis{" "}
                <Link to="/data-types/hardware-models">Type des données → Matériel</Link>.
              </p>
            ) : (
              <>
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
                      ref={imgRef}
                      src={hardwareModelImageUrl(selectedHardwareModel.imagePath)}
                      alt={selectedHardwareModel.name}
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
              </>
            )}
          </div>

          <div className="ports-designer-list">
            <h3>Ports du modèle</h3>
            <form className="inline-form" onSubmit={handleGeneratePorts}>
              <label>
                Type de liaison
                <select value={bulkLinkTypeId} onChange={(e) => setBulkLinkTypeId(Number(e.target.value))} required>
                  {linkTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantité
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(Number(e.target.value))}
                  required
                />
              </label>
              <button type="submit" disabled={bulkSubmitting}>
                Générer
              </button>
            </form>
            {bulkError && <p className="error">{bulkError}</p>}
            {editLabelError && <p className="error">{editLabelError}</p>}
            <table className="table">
              <thead>
                <tr>
                  <th>Type de liaison</th>
                  <th>Label</th>
                  <th>Zone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ports.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="port-region-swatch" style={{ background: p.linkTypeColor }} /> {p.portType}
                    </td>
                    <td>
                      {editingPortId === p.id ? (
                        <input
                          type="text"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveLabel(p);
                            } else if (e.key === "Escape") {
                              cancelEditLabel();
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        p.label
                      )}
                    </td>
                    <td>
                      {p.regionX !== null ? (
                        <button type="button" className="link danger" onClick={() => handleRemoveRegion(p.id)}>
                          Supprimer la zone
                        </button>
                      ) : (
                        <span className="muted">Non placé</span>
                      )}
                    </td>
                    <td className="table-actions">
                      {editingPortId === p.id ? (
                        <>
                          <button type="button" className="link" onClick={() => handleSaveLabel(p)}>
                            Enregistrer
                          </button>
                          <button type="button" className="link" onClick={cancelEditLabel}>
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="link" onClick={() => startEditLabel(p)}>
                            Modifier
                          </button>
                          <button className="danger" onClick={() => handleDeletePort(p.id)}>
                            Supprimer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ports.length === 0 && <p className="muted">Aucun port défini pour ce modèle.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
