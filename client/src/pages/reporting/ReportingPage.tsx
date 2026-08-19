import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { listEquipment } from "../../api/equipment";
import type { Equipment } from "../../api/equipment";
import { listAddressing } from "../../api/equipmentPortSettings";
import type { AddressingPort } from "../../api/equipmentPortSettings";
import { listApis } from "../../api/apis";
import type { Api } from "../../api/apis";
import { listSwitchConfigs } from "../../api/switchConfigs";
import type { SwitchConfigSummary } from "../../api/switchConfigs";
import { listMgateConfigs } from "../../api/mgateConfigs";
import type { MgateConfigSummary } from "../../api/mgateConfigs";
import {
  listReportConfigs,
  createReportConfig,
  updateReportConfig,
  deleteReportConfig,
} from "../../api/reportConfigs";
import type { ReportConfig } from "../../api/reportConfigs";
import { ApiError } from "../../api/client";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination";
import { SimpleNameFormModal } from "../../components/SimpleNameFormModal";

interface ReportRow {
  key: string;
  equipment: Equipment;
  api?: Api;
  port?: AddressingPort;
  switchConfig?: SwitchConfigSummary;
  mgateConfig?: MgateConfigSummary;
}

type CellValue = string | number | boolean | null;

interface ReportColumn {
  id: string;
  label: string;
  category: string;
  value: (row: ReportRow) => CellValue;
  format?: (value: CellValue) => string;
}

function formatDate(value: CellValue) {
  if (!value) return "—";
  return new Date(String(value)).toLocaleDateString("fr-FR");
}

function formatDefault(value: CellValue) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return String(value);
}

// L'ordre ici définit l'ordre des colonnes affichées et l'ordre dans le panneau de sélection.
const COLUMNS: ReportColumn[] = [
  { id: "eq_name", label: "Nom", category: "Matériel", value: (r) => r.equipment.name },
  { id: "eq_deviceType", label: "Type", category: "Matériel", value: (r) => r.equipment.deviceType },
  { id: "eq_brand", label: "Marque", category: "Matériel", value: (r) => r.equipment.brandName },
  { id: "eq_model", label: "Modèle", category: "Matériel", value: (r) => r.equipment.hardwareModel },
  { id: "eq_apiStart", label: "Point de départ API", category: "Matériel", value: (r) => r.equipment.isApiStartPoint },
  { id: "site", label: "Site", category: "Salle", value: (r) => r.equipment.siteName },
  { id: "zone", label: "Zone", category: "Salle", value: (r) => r.equipment.zoneName },
  { id: "room", label: "Salle", category: "Salle", value: (r) => r.equipment.roomName },
  { id: "api_name", label: "API", category: "API", value: (r) => r.equipment.apiName },
  {
    id: "api_migrationDate",
    label: "Date de migration",
    category: "API",
    value: (r) => r.api?.migrationDate ?? null,
    format: formatDate,
  },
  { id: "api_completed", label: "Terminé", category: "API", value: (r) => r.api?.completed ?? null },
  { id: "api_doe", label: "DOE à jour", category: "API", value: (r) => r.api?.doeUpToDate ?? null },
  { id: "port_label", label: "Port", category: "Adressage", value: (r) => r.port?.label ?? null },
  { id: "port_type", label: "Type de port", category: "Adressage", value: (r) => r.port?.portType ?? null },
  { id: "port_modbus", label: "Adresse ModBus", category: "Adressage", value: (r) => r.port?.modbusAddress ?? null },
  { id: "port_vlan", label: "VLAN", category: "Adressage", value: (r) => r.port?.vlan ?? null },
  { id: "port_ip", label: "Adresse IP", category: "Adressage", value: (r) => r.port?.ipAddress ?? null },
  { id: "port_gateway", label: "Passerelle", category: "Adressage", value: (r) => r.port?.gateway ?? null },
  { id: "port_mask", label: "Masque", category: "Adressage", value: (r) => r.port?.subnetMask ?? null },
  { id: "sw_sysName", label: "Sys Name", category: "Config Switch", value: (r) => r.switchConfig?.sysName ?? null },
  {
    id: "sw_managementIp",
    label: "IP de gestion",
    category: "Config Switch",
    value: (r) => r.switchConfig?.managementIp ?? null,
  },
  {
    id: "sw_firmware",
    label: "Version firmware",
    category: "Config Switch",
    value: (r) => r.switchConfig?.firmwareVersion ?? null,
  },
  {
    id: "sw_sysLocation",
    label: "Sys Location",
    category: "Config Switch",
    value: (r) => r.switchConfig?.sysLocation ?? null,
  },
  { id: "sw_vlanCount", label: "Nb VLAN", category: "Config Switch", value: (r) => r.switchConfig?.vlanCount ?? null },
  { id: "sw_portCount", label: "Nb ports", category: "Config Switch", value: (r) => r.switchConfig?.portCount ?? null },
  { id: "mx_deviceName", label: "Nom", category: "Config Moxa", value: (r) => r.mgateConfig?.deviceName ?? null },
  { id: "mx_ip", label: "Adresse IP", category: "Config Moxa", value: (r) => r.mgateConfig?.ipAddress ?? null },
  { id: "mx_location", label: "Emplacement", category: "Config Moxa", value: (r) => r.mgateConfig?.location ?? null },
  {
    id: "mx_serialPortCount",
    label: "Nb ports série",
    category: "Config Moxa",
    value: (r) => r.mgateConfig?.serialPortCount ?? null,
  },
];

const COLUMN_BY_ID = new Map(COLUMNS.map((c) => [c.id, c]));

const CATEGORIES = [...new Set(COLUMNS.map((c) => c.category))];

const DEFAULT_COLUMN_IDS = ["eq_name", "eq_deviceType", "eq_brand", "eq_model", "site", "zone", "room", "api_name"];

function compareValues(a: CellValue, b: CellValue) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a ?? "").localeCompare(String(b ?? ""));
}

// Le catalogue peut recevoir plusieurs imports de config pour un même modèle matériel — on ne
// garde que le plus récent pour le rapport.
function latestByHardwareModel<T extends { hardwareModelId: number; importedAt: string }>(items: T[]) {
  const map = new Map<number, T>();
  for (const item of items) {
    const existing = map.get(item.hardwareModelId);
    if (!existing || new Date(item.importedAt).getTime() > new Date(existing.importedAt).getTime()) {
      map.set(item.hardwareModelId, item);
    }
  }
  return map;
}

export function ReportingPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [portsByEquipmentId, setPortsByEquipmentId] = useState<Map<number, AddressingPort[]>>(new Map());
  const [apiById, setApiById] = useState<Map<number, Api>>(new Map());
  const [switchConfigByHardwareModelId, setSwitchConfigByHardwareModelId] = useState<Map<number, SwitchConfigSummary>>(
    new Map()
  );
  const [mgateConfigByHardwareModelId, setMgateConfigByHardwareModelId] = useState<Map<number, MgateConfigSummary>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(new Set(DEFAULT_COLUMN_IDS));
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Excel-style column filters: a column with no entry here is unfiltered (every value shown).
  // Once narrowed, the entry holds the set of displayed (formatted) values still checked — a
  // column filtered down to "every value currently checked" is reset back to "no entry" so the
  // funnel icon stops looking active, matching how Excel clears the filter when everything is
  // re-checked.
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");

  // Saved reporting views: selectedConfigId tracks which one "Enregistrer" overwrites; picking
  // "— Nouvelle configuration —" just detaches from that config without touching the current
  // columns/sort/filters (no destructive reset), mirroring a typical Save/Save As split.
  const [reportConfigs, setReportConfigs] = useState<ReportConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<number | "">("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [{ equipment: eq }, { equipment: addressing }, { apis }, { switchConfigs }, { mgateConfigs }, { configs }] =
          await Promise.all([
            listEquipment(),
            listAddressing(),
            listApis(),
            listSwitchConfigs(),
            listMgateConfigs(),
            listReportConfigs(),
          ]);
        setEquipment(eq);
        setPortsByEquipmentId(new Map(addressing.map((a) => [a.equipmentId, a.ports])));
        setApiById(new Map(apis.map((a) => [a.id, a])));
        setSwitchConfigByHardwareModelId(latestByHardwareModel(switchConfigs));
        setMgateConfigByHardwareModelId(latestByHardwareModel(mgateConfigs));
        setReportConfigs(configs);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayedColumns = useMemo(
    () => COLUMNS.filter((c) => selectedColumnIds.has(c.id)),
    [selectedColumnIds]
  );
  const hasAddressingColumn = displayedColumns.some((c) => c.category === "Adressage");

  function displayValue(column: ReportColumn, row: ReportRow) {
    return (column.format ?? formatDefault)(column.value(row));
  }

  // Only filters on currently displayed columns apply — hiding a filtered column clears its
  // effect on the table rather than leaving an invisible filter active.
  function rowMatchesFilters(row: ReportRow, excludeColumnId?: string) {
    for (const column of displayedColumns) {
      if (column.id === excludeColumnId) continue;
      const allowed = columnFilters[column.id];
      if (!allowed) continue;
      if (!allowed.has(displayValue(column, row))) return false;
    }
    return true;
  }

  const reportRows = useMemo(() => {
    const out: ReportRow[] = [];
    for (const eq of equipment) {
      const api = eq.apiId ? apiById.get(eq.apiId) : undefined;
      const switchConfig = switchConfigByHardwareModelId.get(eq.hardwareModelId);
      const mgateConfig = mgateConfigByHardwareModelId.get(eq.hardwareModelId);
      if (hasAddressingColumn) {
        const ports = portsByEquipmentId.get(eq.id) ?? [];
        for (const port of ports) {
          out.push({ key: `${eq.id}:${port.hardwareModelPortId}`, equipment: eq, api, port, switchConfig, mgateConfig });
        }
      } else {
        out.push({ key: String(eq.id), equipment: eq, api, switchConfig, mgateConfig });
      }
    }
    return out;
  }, [equipment, hasAddressingColumn, portsByEquipmentId, apiById, switchConfigByHardwareModelId, mgateConfigByHardwareModelId]);

  const filteredRows = useMemo(
    () => reportRows.filter((row) => rowMatchesFilters(row)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportRows, columnFilters, displayedColumns]
  );

  const sortedRows = useMemo(() => {
    if (!sortColumnId) return filteredRows;
    const column = COLUMN_BY_ID.get(sortColumnId);
    if (!column) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const cmp = compareValues(column.value(a), column.value(b));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortColumnId, sortDir]);

  // The checkbox list for an open filter reflects every OTHER active filter (Excel's cascading
  // behavior), so a user narrowing column A can still see which values remain reachable in
  // column B rather than a stale full list.
  const filterPanelOptions = useMemo(() => {
    if (!openFilterId) return [] as { value: string; count: number }[];
    const column = COLUMN_BY_ID.get(openFilterId);
    if (!column) return [];
    const counts = new Map<string, number>();
    for (const row of reportRows) {
      if (!rowMatchesFilters(row, openFilterId)) continue;
      const value = displayValue(column, row);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFilterId, reportRows, columnFilters]);

  const { page, setPage, pageCount, pagedItems } = usePagination(sortedRows);

  function toggleColumn(id: string) {
    setSelectedColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFilterValue(columnId: string, value: string) {
    setColumnFilters((prev) => {
      const allValues = filterPanelOptions.map((o) => o.value);
      const current = new Set(prev[columnId] ?? allValues);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      const next = { ...prev };
      if (current.size >= allValues.length) delete next[columnId];
      else next[columnId] = current;
      return next;
    });
  }

  function selectAllFilterValues(columnId: string) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  }

  function clearAllFilterValues(columnId: string) {
    setColumnFilters((prev) => ({ ...prev, [columnId]: new Set() }));
  }

  function toggleFilterPopover(columnId: string) {
    setFilterSearch("");
    setOpenFilterId((prev) => (prev === columnId ? null : columnId));
  }

  useEffect(() => {
    if (!openFilterId) return;
    function close() {
      setOpenFilterId(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openFilterId]);

  function handleExportXlsx() {
    const header = displayedColumns.map((c) => c.label);
    const rows = sortedRows.map((row) => displayedColumns.map((c) => displayValue(c, row)));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...rows]), "Reporting");
    XLSX.writeFile(workbook, `reporting-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function currentConfigPayload(name: string) {
    return {
      name,
      columnIds: [...selectedColumnIds],
      filters: Object.fromEntries(Object.entries(columnFilters).map(([id, values]) => [id, [...values]])),
      sortColumnId,
      sortDir,
    };
  }

  function applyConfig(config: ReportConfig) {
    setSelectedColumnIds(new Set(config.columnIds.filter((id) => COLUMN_BY_ID.has(id))));
    setColumnFilters(
      Object.fromEntries(Object.entries(config.filters).map(([id, values]) => [id, new Set(values)]))
    );
    setSortColumnId(config.sortColumnId);
    setSortDir(config.sortDir);
  }

  function handleSelectConfig(value: string) {
    setConfigError(null);
    if (!value) {
      setSelectedConfigId("");
      return;
    }
    const id = Number(value);
    setSelectedConfigId(id);
    const config = reportConfigs.find((c) => c.id === id);
    if (config) applyConfig(config);
  }

  async function handleSaveConfig() {
    if (selectedConfigId === "") return;
    const current = reportConfigs.find((c) => c.id === selectedConfigId);
    if (!current) return;
    setConfigError(null);
    setSavingConfig(true);
    try {
      const { config } = await updateReportConfig(selectedConfigId, currentConfigPayload(current.name));
      setReportConfigs((prev) => prev.map((c) => (c.id === config.id ? config : c)));
    } catch (err) {
      setConfigError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSaveConfigAs(name: string) {
    const { config } = await createReportConfig(currentConfigPayload(name));
    setReportConfigs((prev) => [...prev, config].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedConfigId(config.id);
  }

  async function handleDeleteConfig() {
    if (selectedConfigId === "") return;
    if (!window.confirm("Supprimer cette configuration enregistrée ?")) return;
    setConfigError(null);
    try {
      await deleteReportConfig(selectedConfigId);
      setReportConfigs((prev) => prev.filter((c) => c.id !== selectedConfigId));
      setSelectedConfigId("");
    } catch (err) {
      setConfigError(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function toggleSort(id: string) {
    if (sortColumnId === id) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortColumnId(id);
      setSortDir("asc");
    }
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Reporting</h1>
        <button type="button" className="btn btn-sm" onClick={handleExportXlsx} disabled={displayedColumns.length === 0}>
          Exporter en .xlsx
        </button>
      </div>
      <p className="muted">
        Choisissez les informations à afficher, cliquez sur une colonne pour trier, ou sur son entonnoir pour filtrer.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="report-config-bar">
        <label>
          Configuration enregistrée
          <select value={selectedConfigId} onChange={(e) => handleSelectConfig(e.target.value)}>
            <option value="">— Nouvelle configuration —</option>
            {reportConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-sm" onClick={handleSaveConfig} disabled={selectedConfigId === "" || savingConfig}>
          {savingConfig ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button type="button" className="btn-outline btn-sm" onClick={() => setSaveAsOpen(true)}>
          Enregistrer sous...
        </button>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={handleDeleteConfig}
          disabled={selectedConfigId === ""}
        >
          Supprimer
        </button>
      </div>
      {configError && <p className="error">{configError}</p>}

      <div className="report-columns">
        {CATEGORIES.map((category) => (
          <fieldset className="report-column-group" key={category}>
            <legend>{category}</legend>
            {COLUMNS.filter((c) => c.category === category).map((column) => (
              <label key={column.id} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={selectedColumnIds.has(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                {column.label}
                {columnFilters[column.id] && (
                  <span className="filter-dot" title="Colonne filtrée" />
                )}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {displayedColumns.length === 0 ? (
        <p className="muted">Sélectionnez au moins une colonne à afficher.</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                {displayedColumns.map((column) => {
                  const active = sortColumnId === column.id;
                  const filterActive = !!columnFilters[column.id];
                  const filterOpen = openFilterId === column.id;
                  const visibleOptions = filterPanelOptions.filter((o) =>
                    o.value.toLowerCase().includes(filterSearch.toLowerCase())
                  );
                  return (
                    <th key={column.id} className="th-filterable">
                      <span className="th-sort" onClick={() => toggleSort(column.id)}>
                        {column.label}
                        {filterActive && <span className="filter-dot" title="Colonne filtrée" />}
                        <span className="sort-indicator">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
                      </span>
                      <button
                        type="button"
                        className={`th-filter-btn${filterActive ? " active" : ""}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFilterPopover(column.id);
                        }}
                        title="Filtrer"
                      >
                        ▾
                      </button>
                      {filterOpen && (
                        <div className="th-filter-popover" onMouseDown={(e) => e.stopPropagation()}>
                          <input
                            type="search"
                            className="th-filter-search"
                            placeholder="Rechercher..."
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="th-filter-actions">
                            <button type="button" onClick={() => selectAllFilterValues(column.id)}>
                              Tout sélectionner
                            </button>
                            <button type="button" onClick={() => clearAllFilterValues(column.id)}>
                              Tout effacer
                            </button>
                          </div>
                          <div className="th-filter-options">
                            {visibleOptions.length === 0 ? (
                              <p className="muted">Aucune valeur.</p>
                            ) : (
                              visibleOptions.map((option) => {
                                const checked = !columnFilters[column.id] || columnFilters[column.id].has(option.value);
                                return (
                                  <label key={option.value} className="checkbox-field th-filter-option">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleFilterValue(column.id, option.value)}
                                    />
                                    {option.value} <span className="muted">({option.count})</span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((row) => (
                <tr key={row.key}>
                  {displayedColumns.map((column) => (
                    <td key={column.id}>{displayValue(column, row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sortedRows.length === 0 && <p className="muted">Aucun résultat.</p>}
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}

      {saveAsOpen && (
        <SimpleNameFormModal
          title="Enregistrer la configuration sous..."
          itemId={null}
          save={handleSaveConfigAs}
          onClose={() => setSaveAsOpen(false)}
          onSaved={() => setSaveAsOpen(false)}
        />
      )}
    </div>
  );
}
