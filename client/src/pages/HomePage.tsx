import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listDeviceTypes } from "../api/deviceTypes";
import { listLinkTypes } from "../api/linkTypes";
import { listBrands } from "../api/brands";
import { listHardwareModels } from "../api/hardwareModels";
import { listSites } from "../api/sites";
import { listApis } from "../api/apis";
import { listEquipment } from "../api/equipment";
import { listEquipmentLinks } from "../api/equipmentLinks";
import { listEquipmentVariableSettings } from "../api/equipmentVariableSettings";
import { listDesignSchemas } from "../api/designSchemas";

interface Stats {
  deviceTypes: number;
  linkTypes: number;
  brands: number;
  hardwareModels: number;
  sites: number;
  apisTotal: number;
  apisCompleted: number;
  equipment: number;
  equipmentLinks: number;
  variables: number;
  mnemonics: number;
  plans: number;
}

function DonutChart({ value, total, size = 64, strokeWidth = 9 }: { value: number; total: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? value / total : 0;
  const dash = circumference * ratio;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-chart">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      {ratio > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

export function HomePage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user?.role.isAdmin) return;
    Promise.all([
      listDeviceTypes(),
      listLinkTypes(),
      listBrands(),
      listHardwareModels(),
      listSites(),
      listApis(),
      listEquipment(),
      listEquipmentLinks(),
      listEquipmentVariableSettings(),
      listDesignSchemas(),
    ])
      .then(
        ([
          { deviceTypes },
          { linkTypes },
          { brands },
          { hardwareModels },
          { sites },
          { apis },
          { equipment },
          { links },
          { equipment: variableSettings },
          { schemas },
        ]) => {
          setStats({
            deviceTypes: deviceTypes.length,
            linkTypes: linkTypes.length,
            brands: brands.length,
            hardwareModels: hardwareModels.length,
            sites: sites.length,
            apisTotal: apis.length,
            apisCompleted: apis.filter((a) => a.completed).length,
            equipment: equipment.length,
            equipmentLinks: links.length,
            variables: variableSettings.reduce((sum, item) => sum + item.variables.length, 0),
            mnemonics: variableSettings.reduce(
              (sum, item) => sum + item.variables.filter((v) => v.mnemonic.trim() !== "").length,
              0
            ),
            plans: schemas.length,
          });
        }
      )
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
        <>
          <h2 className="stats-section-title">Catalogue</h2>
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
              <span className="stat-label">Modèles de matériel</span>
            </Link>
          </div>

          <h2 className="stats-section-title">Exploitation</h2>
          <div className="stats-grid">
            <Link to="/sites" className="stat-card">
              <span className="stat-value">{stats.sites}</span>
              <span className="stat-label">Sites</span>
            </Link>
            <Link to="/equipment" className="stat-card">
              <span className="stat-value">{stats.equipment}</span>
              <span className="stat-label">Matériel</span>
            </Link>
            <Link to="/equipment/links" className="stat-card">
              <span className="stat-value">{stats.equipmentLinks}</span>
              <span className="stat-label">Liaisons</span>
            </Link>
            <Link to="/variables" className="stat-card">
              <span className="stat-value">{stats.variables}</span>
              <span className="stat-label">Variables</span>
            </Link>
            <Link to="/variables" className="stat-card">
              <span className="stat-value">{stats.mnemonics}</span>
              <span className="stat-label">Mnémoniques</span>
            </Link>
            <Link to="/plans" className="stat-card">
              <span className="stat-value">{stats.plans}</span>
              <span className="stat-label">Plans</span>
            </Link>
          </div>

          <Link to="/apis" className="stat-card stat-card-chart stat-card-chart-featured">
            <DonutChart value={stats.apisCompleted} total={stats.apisTotal} size={220} strokeWidth={28} />
            <div className="stat-card-chart-text">
              <span className="stat-value">
                {stats.apisCompleted}/{stats.apisTotal}
              </span>
              <span className="stat-label">APIs terminées</span>
            </div>
          </Link>
        </>
      )}
    </div>
  );
}
