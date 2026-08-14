import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listEquipment } from "../api/equipment";
import { listManufacturers } from "../api/manufacturers";
import { listPorts } from "../api/ports";

interface Stats {
  equipment: number;
  manufacturers: number;
  ports: number;
}

export function HomePage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    Promise.all([listEquipment(), listManufacturers(), listPorts()])
      .then(([{ equipment }, { manufacturers }, { ports }]) => {
        setStats({ equipment: equipment.length, manufacturers: manufacturers.length, ports: ports.length });
      })
      .catch(() => setStats(null));
  }, [user]);

  if (loading) return <p>Chargement...</p>;

  if (!user) {
    return (
      <div className="card hero-card">
        <h1>Bienvenue</h1>
        <p>Connecte-toi ou crée un compte pour accéder à ton espace.</p>
        <div className="hero-actions">
          <Link to="/login" className="btn btn-outline">
            Connecte-toi
          </Link>
          <Link to="/register" className="btn">
            Crée un compte
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {stats && (
        <div className="stats-grid">
          <Link to="/equipment" className="stat-card">
            <span className="stat-value">{stats.equipment}</span>
            <span className="stat-label">Équipements</span>
          </Link>
          <Link to="/equipment/manufacturers" className="stat-card">
            <span className="stat-value">{stats.manufacturers}</span>
            <span className="stat-label">Constructeurs</span>
          </Link>
          <Link to="/equipment/ports" className="stat-card">
            <span className="stat-value">{stats.ports}</span>
            <span className="stat-label">Entrées / Sorties</span>
          </Link>
        </div>
      )}
    </div>
  );
}
