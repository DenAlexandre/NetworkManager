import { apiFetch } from "./client";

export interface VariableSetting {
  hardwareModelVariableId: number;
  name: string;
  unit: string;
  register: string;
  mnemonic: string;
  description: string;
}

export interface EquipmentVariableSettings {
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
  variables: VariableSetting[];
}

export interface EquipmentVariableSettingInput {
  equipmentId: number;
  hardwareModelVariableId: number;
  mnemonic: string;
  description: string;
}

export function listEquipmentVariableSettings() {
  return apiFetch<{ equipment: EquipmentVariableSettings[] }>("/equipment-variable-settings");
}

export function saveEquipmentVariableSetting(input: EquipmentVariableSettingInput) {
  return apiFetch<{ variable: VariableSetting }>("/equipment-variable-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
