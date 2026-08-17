import { apiFetch } from "./client";

export interface AddressingPort {
  hardwareModelPortId: number;
  label: string;
  portType: string;
  modbusAddress: string | null;
  vlan: string | null;
  ipAddress: string | null;
  gateway: string | null;
  subnetMask: string | null;
}

export interface AddressingEquipment {
  equipmentId: number;
  equipmentName: string;
  deviceType: string;
  hardwareModel: string;
  brandName: string;
  roomId: number;
  siteName: string;
  zoneName: string;
  roomName: string;
  apiId: number | null;
  apiName: string | null;
  ports: AddressingPort[];
}

export interface EquipmentPortSettingInput {
  equipmentId: number;
  hardwareModelPortId: number;
  modbusAddress?: string | null;
  vlan?: string | null;
  ipAddress?: string | null;
  gateway?: string | null;
  subnetMask?: string | null;
}

export function listAddressing() {
  return apiFetch<{ equipment: AddressingEquipment[] }>("/equipment-port-settings");
}

export function saveEquipmentPortSetting(input: EquipmentPortSettingInput) {
  return apiFetch<{ port: AddressingPort }>("/equipment-port-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
