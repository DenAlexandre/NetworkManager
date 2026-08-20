import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listAddressing } from "../../api/equipmentPortSettings";
import type { AddressingEquipment, AddressingPort } from "../../api/equipmentPortSettings";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { AddressingConfigModal } from "./AddressingConfigModal";
import { usePermission } from "../../hooks/usePermission";

const NO_API_LABEL = "Sans API";

function roomLabel(item: AddressingEquipment) {
  return `${item.zoneName} / ${item.roomName}`;
}

function isPortConfigured(port: AddressingPort) {
  return Boolean(port.modbusAddress || port.vlan || port.ipAddress || port.gateway || port.subnetMask);
}

export function AddressingPage() {
  const { canWrite } = usePermission("equipment");
  const [items, setItems] = useState<AddressingEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const deviceTypeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) names.add(item.deviceType);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const roomOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const item of items) labels.add(roomLabel(item));
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const apiOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) names.add(item.apiName ?? NO_API_LABEL);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const columns = useMemo<FilterColumn<AddressingEquipment>[]>(
    () => [
      { key: "equipmentName", getValue: (item) => item.equipmentName },
      {
        key: "deviceType",
        getValue: (item) => item.deviceType,
        type: "select",
        options: deviceTypeOptions.map((name) => ({ value: name, label: name })),
      },
      { key: "materiel", getValue: (item) => `${item.brandName} — ${item.hardwareModel}` },
      {
        key: "emplacement",
        getValue: roomLabel,
        type: "select",
        options: roomOptions.map((label) => ({ value: label, label })),
      },
      {
        key: "api",
        getValue: (item) => item.apiName ?? NO_API_LABEL,
        type: "select",
        options: apiOptions.map((name) => ({ value: name, label: name })),
      },
    ],
    [deviceTypeOptions, roomOptions, apiOptions]
  );

  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(items, columns);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);

  useEffect(() => {
    load();
  }, []);

  // Supports deep-linking here (e.g. from Design's equipment context menu) via
  // /equipment/addressing?open=<equipmentId>&returnTo=<path>, opening that equipment's config
  // modal directly once the list has loaded, then stripping the query params so they don't
  // reopen on refresh. returnTo is remembered so closing the modal sends the user back where
  // they came from instead of leaving them stranded on this list.
  useEffect(() => {
    const openId = Number(searchParams.get("open"));
    if (!openId || !items.some((item) => item.equipmentId === openId)) return;
    setReturnTo(searchParams.get("returnTo"));
    setSelectedId(openId);
    setSearchParams({}, { replace: true });
  }, [items, searchParams, setSearchParams]);

  async function load() {
    setLoading(true);
    try {
      const { equipment } = await listAddressing();
      setItems(equipment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  function handleCloseModal() {
    if (returnTo) {
      navigate(returnTo);
      return;
    }
    setSelectedId(null);
    load();
  }

  const selected = items.find((item) => item.equipmentId === selectedId) ?? null;

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Adressage</h2>
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="equipmentName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Type" field="deviceType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th>Matériel</th>
            <th>Emplacement</th>
            <th>API</th>
            <th>Ports configurés</th>
            <th></th>
          </tr>
          <tr className="filter-row">
            {columns.map((column) => (
              <th key={column.key}>
                <ColumnFilterCell column={column} value={filters[column.key] ?? ""} onChange={(v) => setFilter(column.key, v)} />
              </th>
            ))}
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((item) => (
            <tr key={item.equipmentId}>
              <td>{item.equipmentName}</td>
              <td>{item.deviceType}</td>
              <td>
                {item.brandName} — {item.hardwareModel}
              </td>
              <td>
                {item.zoneName} / {item.roomName}
              </td>
              <td>{item.apiName ?? "—"}</td>
              <td>
                {item.ports.filter(isPortConfigured).length} / {item.ports.length}
              </td>
              <td className="table-actions">
                {canWrite && (
                  <button type="button" className="link" onClick={() => setSelectedId(item.equipmentId)}>
                    Adresser
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucun matériel ne possède de port ModBus ou TCP/IP.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {selected && <AddressingConfigModal equipment={selected} onClose={handleCloseModal} />}
    </div>
  );
}
