import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getZone } from "../../api/zones";
import type { Zone } from "../../api/zones";
import { deleteRoom, listRooms } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { ApiError } from "../../api/client";
import { useSitesTree } from "../../context/SitesTreeContext";
import { useTableQuery } from "../../hooks/useTableQuery";
import type { FilterColumn } from "../../hooks/useTableQuery";
import { usePagination } from "../../hooks/usePagination";
import { SortableHeader } from "../../components/SortableHeader";
import { ColumnFilterCell } from "../../components/ColumnFilterCell";
import { Pagination } from "../../components/Pagination";
import { RoomFormModal } from "./RoomFormModal";
import { usePermission } from "../../hooks/usePermission";

const COLUMNS: FilterColumn<Room>[] = [{ key: "name", getValue: (item) => item.name }];

export function ZoneDetailPage() {
  const { canWrite } = usePermission("sites");
  const { siteId, zoneId } = useParams();
  const [zone, setZone] = useState<Zone | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useSitesTree();
  const { filters, setFilter, sortKey, sortDir, toggleSort, rows } = useTableQuery(rooms, COLUMNS);
  const { page, setPage, pageCount, pagedItems } = usePagination(rows);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [zoneId]);

  async function load() {
    setLoading(true);
    try {
      const [{ zone: z }, { rooms: r }] = await Promise.all([
        getZone(Number(zoneId)),
        listRooms(Number(zoneId)),
      ]);
      setZone(z);
      setRooms(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette salle ?")) return;
    try {
      await deleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  function openCreateModal() {
    setEditingId(null);
    setModalOpen(true);
  }

  function openEditModal(id: number) {
    setEditingId(id);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    load();
  }

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!zone) return null;

  return (
    <div className="card">
      <div className="page-header">
        <h1>{zone.name}</h1>
        {canWrite && (
          <button type="button" className="btn" onClick={openCreateModal}>
            Ajouter une salle
          </button>
        )}
      </div>
      <p className="muted">{zone.siteName}</p>
      <table className="table">
        <thead>
          <tr>
            <SortableHeader label="Salle" field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th></th>
          </tr>
          <tr className="filter-row">
            <th>
              <ColumnFilterCell column={COLUMNS[0]} value={filters[COLUMNS[0].key] ?? ""} onChange={(v) => setFilter(COLUMNS[0].key, v)} />
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagedItems.map((room) => (
            <tr key={room.id}>
              <td>
                <Link to={`/sites/${siteId}/zones/${zone.id}/rooms/${room.id}`}>{room.name}</Link>
              </td>
              <td className="table-actions">
                {canWrite && (
                  <>
                    <button type="button" className="link" onClick={() => openEditModal(room.id)}>
                      Modifier
                    </button>
                    <button className="danger" onClick={() => handleDelete(room.id)}>
                      Supprimer
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Aucune salle pour cette zone.</p>}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      {modalOpen && (
        <RoomFormModal
          zoneId={zone.id}
          zoneName={zone.name}
          siteName={zone.siteName}
          roomId={editingId}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
