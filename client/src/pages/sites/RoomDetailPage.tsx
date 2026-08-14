import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getRoom } from "../../api/rooms";
import type { Room } from "../../api/rooms";
import { ApiError } from "../../api/client";

export function RoomDetailPage() {
  const { roomId } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [roomId]);

  async function load() {
    setLoading(true);
    try {
      const { room: r } = await getRoom(Number(roomId));
      setRoom(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!room) return null;

  return (
    <div className="card">
      <h1>{room.name}</h1>
      <p className="muted">
        {room.siteName} / {room.zoneName}
      </p>
    </div>
  );
}
