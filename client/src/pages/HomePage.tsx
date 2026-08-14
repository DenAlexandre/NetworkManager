import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listDeviceTypes } from "../api/deviceTypes";
import { listLinkTypes } from "../api/linkTypes";
import { listBrands } from "../api/brands";
import { listHardwareModels } from "../api/hardwareModels";

interface Stats {
  deviceTypes: number;
  linkTypes: number;
  brands: number;
  hardwareModels: number;
}

export function HomePage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    Promise.all([listDeviceTypes(), listLinkTypes(), listBrands(), listHardwareModels()])
      .then(([{ deviceTypes }, { linkTypes }, { brands }, { hardwareModels }]) => {
        setStats({
          deviceTypes: deviceTypes.length,
          linkTypes: linkTypes.length,
          brands: brands.length,
          hardwareModels: hardwareModels.length,
        });
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
          <Link to="/data-types" className="stat-card">
            <span className="stat-value">{stats.deviceTypes}</span>
            <span className="stat-label">Types de matériel</span>
          </Link>
          <Link to="/data-types/link-types" className="stat-card">
            <span className="stat-value">{stats.linkTypes}</span>
            <span className="stat-label">Types de liaison</span>
          </Link>
          <Link to="/data-types/brands" className="stat-card">
            <span className="stat-value">{stats.brands}</span>
            <span className="stat-label">Constructeurs</span>
          </Link>
          <Link to="/data-types/hardware-models" className="stat-card">
            <span className="stat-value">{stats.hardwareModels}</span>
            <span className="stat-label">Matériel</span>
          </Link>
        </div>
      )}
    </div>
  );
}
