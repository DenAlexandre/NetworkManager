import { useState } from "react";
import { saveEquipmentPortSetting } from "../../api/equipmentPortSettings";
import type { AddressingEquipment, AddressingPort } from "../../api/equipmentPortSettings";
import { ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";

function normalizePortType(name: string) {
  return name.toLowerCase().replace(/[\s/]/g, "");
}

function isModbusPort(p: AddressingPort) {
  return normalizePortType(p.portType).includes("modbus");
}

interface PortFields {
  modbusAddress: string;
  vlan: string;
  ipAddress: string;
  gateway: string;
  subnetMask: string;
}

function fieldsFromPort(p: AddressingPort): PortFields {
  return {
    modbusAddress: p.modbusAddress ?? "",
    vlan: p.vlan ?? "",
    ipAddress: p.ipAddress ?? "",
    gateway: p.gateway ?? "",
    subnetMask: p.subnetMask ?? "",
  };
}

interface AddressingConfigModalProps {
  equipment: AddressingEquipment;
  onClose: () => void;
}

export function AddressingConfigModal({ equipment, onClose }: AddressingConfigModalProps) {
  const [drafts, setDrafts] = useState<Record<number, PortFields>>(() => {
    const initial: Record<number, PortFields> = {};
    for (const port of equipment.ports) {
      initial[port.hardwareModelPortId] = fieldsFromPort(port);
    }
    return initial;
  });
  const [savingPortId, setSavingPortId] = useState<number | null>(null);
  const [savedPortId, setSavedPortId] = useState<number | null>(null);
  const [portErrors, setPortErrors] = useState<Record<number, string>>({});

  function updateDraft(portId: number, field: keyof PortFields, value: string) {
    setDrafts((prev) => ({ ...prev, [portId]: { ...prev[portId], [field]: value } }));
  }

  async function handleSave(port: AddressingPort) {
    const draft = drafts[port.hardwareModelPortId];
    setSavingPortId(port.hardwareModelPortId);
    setPortErrors((prev) => {
      const next = { ...prev };
      delete next[port.hardwareModelPortId];
      return next;
    });
    try {
      const { port: updated } = await saveEquipmentPortSetting({
        equipmentId: equipment.equipmentId,
        hardwareModelPortId: port.hardwareModelPortId,
        modbusAddress: draft.modbusAddress,
        vlan: draft.vlan,
        ipAddress: draft.ipAddress,
        gateway: draft.gateway,
        subnetMask: draft.subnetMask,
      });
      setDrafts((prev) => ({ ...prev, [updated.hardwareModelPortId]: fieldsFromPort(updated) }));
      setSavedPortId(port.hardwareModelPortId);
      setTimeout(() => setSavedPortId((cur) => (cur === port.hardwareModelPortId ? null : cur)), 1500);
    } catch (err) {
      setPortErrors((prev) => ({
        ...prev,
        [port.hardwareModelPortId]: err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.",
      }));
    } finally {
      setSavingPortId(null);
    }
  }

  return (
    <Modal title={`Adressage — ${equipment.equipmentName}`} onClose={onClose} wide>
      <p className="muted">
        {equipment.brandName} — {equipment.hardwareModel} · {equipment.siteName} / {equipment.zoneName} /{" "}
        {equipment.roomName}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Port</th>
            <th>Type</th>
            <th>Configuration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {equipment.ports.map((port) => {
            const draft = drafts[port.hardwareModelPortId] ?? fieldsFromPort(port);
            const modbus = isModbusPort(port);
            return (
              <tr key={port.hardwareModelPortId}>
                <td>{port.label}</td>
                <td>{port.portType}</td>
                <td>
                  <div className="addressing-fields">
                    {modbus ? (
                      <label>
                        Adresse
                        <input
                          type="text"
                          value={draft.modbusAddress}
                          onChange={(e) => updateDraft(port.hardwareModelPortId, "modbusAddress", e.target.value)}
                        />
                      </label>
                    ) : (
                      <>
                        <label>
                          VLAN
                          <input
                            type="text"
                            value={draft.vlan}
                            onChange={(e) => updateDraft(port.hardwareModelPortId, "vlan", e.target.value)}
                          />
                        </label>
                        <label>
                          Adresse IP
                          <input
                            type="text"
                            value={draft.ipAddress}
                            onChange={(e) => updateDraft(port.hardwareModelPortId, "ipAddress", e.target.value)}
                          />
                        </label>
                        <label>
                          Passerelle
                          <input
                            type="text"
                            value={draft.gateway}
                            onChange={(e) => updateDraft(port.hardwareModelPortId, "gateway", e.target.value)}
                          />
                        </label>
                        <label>
                          Masque
                          <input
                            type="text"
                            value={draft.subnetMask}
                            onChange={(e) => updateDraft(port.hardwareModelPortId, "subnetMask", e.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </div>
                  {portErrors[port.hardwareModelPortId] && <p className="error">{portErrors[port.hardwareModelPortId]}</p>}
                </td>
                <td className="table-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={savingPortId === port.hardwareModelPortId}
                    onClick={() => handleSave(port)}
                  >
                    {savedPortId === port.hardwareModelPortId ? "Enregistré ✓" : "Enregistrer"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="form-actions">
        <button type="button" className="btn-outline" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
