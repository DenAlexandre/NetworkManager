import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteSwitchConfig, downloadSwitchConfigXml, getSwitchConfig } from "../../api/switchConfigs";
import type { SwitchConfigDetail } from "../../api/switchConfigs";
import { ApiError } from "../../api/client";

export function SwitchConfigDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<SwitchConfigDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const { switchConfig } = await getSwitchConfig(Number(id));
      setConfig(switchConfig);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!config || !window.confirm("Supprimer cette configuration ?")) return;
    try {
      await deleteSwitchConfig(config.id);
      navigate("/configurations");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleDownload() {
    if (!config) return;
    try {
      await downloadSwitchConfigXml(config.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors du téléchargement.");
    }
  }

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!config) return null;

  return (
    <div className="card">
      <div className="page-header">
        <h2>{config.sysName || "Switch"}</h2>
        <div className="table-actions">
          <button type="button" className="btn-outline" onClick={handleDownload}>
            Télécharger XML
          </button>
          <button className="danger" onClick={handleDelete}>
            Supprimer
          </button>
        </div>
      </div>

      <div className="card card-compact-top">
        <h2>Informations</h2>
        <table className="table">
          <tbody>
            <tr>
              <th>Contact</th>
              <td>{config.sysContact || "—"}</td>
              <th>Localisation</th>
              <td>{config.sysLocation || "—"}</td>
            </tr>
            <tr>
              <th>Modèle (catalogue)</th>
              <td>
                {config.brandName} — {config.hardwareModelName}
              </td>
              <th>Modèle</th>
              <td>{config.productId}</td>
            </tr>
            <tr>
              <th>Firmware</th>
              <td>{config.firmwareVersion}</td>
              <td></td>
              <td></td>
            </tr>
            <tr>
              <th>IP de gestion</th>
              <td>
                {config.managementIp}/{config.prefixLength}
              </td>
              <th>Passerelle</th>
              <td>{config.gatewayIp}</td>
            </tr>
            <tr>
              <th>VLAN de gestion</th>
              <td>{config.managementVlanId}</td>
              <th>Importé</th>
              <td>
                {new Date(config.importedAt).toLocaleString()} par {config.importedBy}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {config.mrpConfigs.length > 0 && (
        <div className="card card-compact-top">
          <h2>MRP</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Domaine</th>
                <th>Port anneau 1</th>
                <th>Port anneau 2</th>
                <th>Rôle</th>
                <th>Délai de récupération</th>
                <th>VLAN</th>
                <th>Priorité MRM</th>
                <th>Actif</th>
                <th>Ring coupling</th>
              </tr>
            </thead>
            <tbody>
              {config.mrpConfigs.map((m) => (
                <tr key={m.id}>
                  <td>{m.domainName}</td>
                  <td>{m.ringPort1}</td>
                  <td>{m.ringPort2}</td>
                  <td>{m.role}</td>
                  <td>{m.recoveryDelay}</td>
                  <td>{m.vlanId}</td>
                  <td>{m.mrmPriority}</td>
                  <td>{m.active ? "Oui" : "Non"}</td>
                  <td>
                    {m.ringCouplingPort ? `${m.ringCouplingPort} (${m.ringCouplingActive ? "actif" : "inactif"})` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card card-compact-top">
        <h2>Ports ({config.ports.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Port</th>
              <th>Statut</th>
              <th>Alimentation</th>
              <th>Débit</th>
              <th>Auto-nego</th>
              <th>PVID</th>
              <th>Trames acceptées</th>
              <th>STP</th>
              <th>LLDP</th>
              <th>Rôle MRP</th>
            </tr>
          </thead>
          <tbody>
            {config.ports.map((p) => (
              <tr key={p.id}>
                <td>{p.portName}</td>
                <td>{p.adminStatus}</td>
                <td>{p.powerState}</td>
                <td>{p.speedLabel}</td>
                <td>{p.autoNeg ? "Oui" : "Non"}</td>
                <td>{p.pvid}</td>
                <td>{p.acceptableFrameTypes}</td>
                <td>{p.stpState}</td>
                <td>{p.lldpAdminStatus}</td>
                <td>{p.mrpRole || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-compact-top">
        <h2>VLANs ({config.vlans.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Ports tagged</th>
              <th>Ports untagged</th>
              <th>Ports interdits</th>
            </tr>
          </thead>
          <tbody>
            {config.vlans.map((v) => (
              <tr key={v.id}>
                <td>{v.vlanIndex}</td>
                <td>{v.name || "—"}</td>
                <td>{v.taggedPortList.join(", ") || "—"}</td>
                <td>{v.untaggedPortList.join(", ") || "—"}</td>
                <td>{v.forbiddenPorts || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
