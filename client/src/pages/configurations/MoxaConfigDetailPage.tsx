import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteMgateConfig, downloadMgateConfigCfg, getMgateConfig } from "../../api/mgateConfigs";
import type { MgateConfigDetail } from "../../api/mgateConfigs";
import { ApiError } from "../../api/client";

function formatSlaveRange(slaveStart: number, slaveEnd: number, modbusStart: number, modbusEnd: number) {
  return slaveStart === slaveEnd ? `#${slaveStart} = ${modbusStart}` : `#${slaveStart}-${slaveEnd} = ${modbusStart}-${modbusEnd}`;
}

export function MoxaConfigDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<MgateConfigDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const { mgateConfig } = await getMgateConfig(Number(id));
      setConfig(mgateConfig);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!config || !window.confirm("Supprimer cette configuration ?")) return;
    try {
      await deleteMgateConfig(config.id);
      navigate("/configurations/moxa");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erreur lors de la suppression.");
    }
  }

  async function handleDownload() {
    if (!config) return;
    try {
      await downloadMgateConfigCfg(config.id);
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
        <h2>{config.deviceName || "Moxa"}</h2>
        <div className="table-actions">
          {config.hasRawCfg && (
            <button type="button" className="btn-outline" onClick={handleDownload}>
              Télécharger .cfg
            </button>
          )}
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
              <th>Description</th>
              <td>{config.description || "—"}</td>
              <th>Localisation</th>
              <td>{config.location || "—"}</td>
            </tr>
            <tr>
              <th>Contact</th>
              <td>{config.contact || "—"}</td>
              <th>Adresse MAC</th>
              <td>{config.macAddress || "—"}</td>
            </tr>
            <tr>
              <th>IP</th>
              <td>{config.ipAddress}</td>
              <th>Masque</th>
              <td>{config.subnetMask || "—"}</td>
            </tr>
            <tr>
              <th>Passerelle</th>
              <td>{config.defaultGateway || "—"}</td>
              <th>DHCP</th>
              <td>{config.dhcpEnabled ? "Activé" : "Désactivé"}</td>
            </tr>
            <tr>
              <th>Port Modbus TCP</th>
              <td>{config.modbusTcpPort}</td>
              <th>Sessions TCP max</th>
              <td>{config.maxTcpSessions}</td>
            </tr>
            <tr>
              <th>SNMP</th>
              <td>{config.snmpEnabled ? `Activé (${config.readCommunity})` : "Désactivé"}</td>
              <th>Importé</th>
              <td>
                {new Date(config.importedAt).toLocaleString()} par {config.importedBy}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card card-compact-top">
        <h2>Slave ID Map</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Port</th>
              <th>Plage(s) ID virtuel = ID réel</th>
            </tr>
          </thead>
          <tbody>
            {config.serialPorts.map((p) => (
              <tr key={p.id}>
                <td>Port {p.portNumber}</td>
                <td>
                  {p.slaveIds.length > 0
                    ? p.slaveIds
                        .map((s) =>
                          formatSlaveRange(s.slaveNumberStart, s.slaveNumberEnd, s.modbusIdStart, s.modbusIdEnd)
                        )
                        .join(", ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-compact-top">
        <h2>Ports série ({config.serialPorts.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Port</th>
              <th>Activé</th>
              <th>Interface</th>
              <th>Vitesse</th>
              <th>Bits de données</th>
              <th>Parité</th>
              <th>Bits de stop</th>
              <th>Contrôle de flux</th>
              <th>Protocole</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {config.serialPorts.map((p) => (
              <tr key={p.id}>
                <td>{p.portNumber}</td>
                <td>{p.enabled ? "Oui" : "Non"}</td>
                <td>{p.interface || "—"}</td>
                <td>{p.baudRate}</td>
                <td>{p.dataBits}</td>
                <td>{p.parity || "—"}</td>
                <td>{p.stopBits}</td>
                <td>{p.flowControl || "—"}</td>
                <td>{p.protocol || "—"}</td>
                <td>{p.operationMode || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {config.serialPorts.length === 0 && <p className="muted">Aucun port série détecté.</p>}
      </div>
    </div>
  );
}
