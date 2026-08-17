import { useEffect, useMemo, useState } from "react";
import { listAddressing } from "../../api/equipmentPortSettings";
import type { AddressingEquipment, AddressingPort } from "../../api/equipmentPortSettings";
import { ApiError } from "../../api/client";
import { useTableQuery } from "../../hooks/useTableQuery";
import { SortableHeader } from "../../components/SortableHeader";
import { AddressingConfigModal } from "./AddressingConfigModal";

function searchFields(item: AddressingEquipment) {
  return [item.equipmentName, item.deviceType, item.brandName, item.hardwareModel, item.siteName, item.zoneName, item.roomName];
}

function isPortConfigured(port: AddressingPort) {
  return Boolean(port.modbusAddress || port.vlan || port.ipAddress || port.gateway || port.subnetMask);
}

export function AddressingPage() {
  const [items, setItems] = useState<AddressingEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [roomFilter, setRoomFilter] = useState<number | "">("");
  const [apiFilter, setApiFilter] = useState<number | "none" | "">("");

  const roomOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      map.set(item.roomId, `${item.siteName} / ${item.zoneName} / ${item.roomName}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const apiOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      if (item.apiId !== null && item.apiName) map.set(item.apiId, item.apiName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (roomFilter !== "" && item.roomId !== roomFilter) return false;
      if (apiFilter === "none" && item.apiId !== null) return false;
      if (typeof apiFilter === "number" && item.apiId !== apiFilter) return false;
      return true;
    });
  }, [items, roomFilter, apiFilter]);

  const { search, setSearch, sortKey, sortDir, toggleSort, rows } = useTableQuery(filteredItems, searchFields);

  useEffect(() => {
    load();
  }, []);

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
    setSelectedId(null);
    load();
  }

  const selected = items.find((item) => item.equipmentId === selectedId) ?? null;

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="card">
      <div className="page-header">
        <h2>Gestion de l'adressage</h2>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-toolbar">
        <input type="search" placeholder="Filtrer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Toutes les salles</option>
          {roomOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={apiFilter}
          onChange={(e) => setApiFilter(e.target.value === "" ? "" : e.target.value === "none" ? "none" : Number(e.target.value))}
        >
          <option value="">Toutes les API</option>
          <option value="none">Sans API</option>
          {apiOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Nom" field="equipmentName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Type" field="deviceType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th>Matériel</th>
            <th>Emplacement</th>
            <th>Ports configurés</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.equipmentId}>
              <td>{item.equipmentName}</td>
              <td>{item.deviceType}</td>
              <td>
                {item.brandName} — {item.hardwareModel}
              </td>
              <td>
                {item.siteName} / {item.zoneName} / {item.roomName}
              </td>
              <td>
                {item.ports.filter(isPortConfigured).length} / {item.ports.length}
              </td>
              <td className="table-actions">
                <button type="button" className="link" onClick={() => setSelectedId(item.equipmentId)}>
                  Adresser
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucun matériel ne possède de port ModBus ou TCP/IP.</p>}
      {selected && <AddressingConfigModal equipment={selected} onClose={handleCloseModal} />}
    </div>
  );
}
