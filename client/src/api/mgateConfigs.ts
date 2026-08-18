import { apiDownload, apiFetch, apiUpload } from "./client";

export interface MgateConfigSummary {
  id: number;
  hardwareModelId: number;
  hardwareModelName: string;
  brandName: string;
  deviceName: string;
  ipAddress: string;
  location: string;
  importedAt: string;
  importedBy: string;
  serialPortCount: number;
}

export interface SupportedMoxaModel {
  id: number;
  name: string;
  brandName: string;
}

export interface MgateSlaveId {
  slaveNumberStart: number;
  slaveNumberEnd: number;
  modbusIdStart: number;
  modbusIdEnd: number;
}

export interface MgateSerialPort {
  id: number;
  portNumber: number;
  enabled: boolean;
  interface: string;
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: number;
  flowControl: string;
  protocol: string;
  operationMode: string;
  responseTimeout: number;
  recoveryTime: number;
  delayBetweenPoll: number;
  terminationEnabled: boolean;
  pullHighLow: string;
  slaveIds: MgateSlaveId[];
}

export interface MgateConfigDetail {
  id: number;
  hardwareModelId: number;
  hardwareModelName: string;
  brandName: string;
  deviceName: string;
  description: string;
  location: string;
  contact: string;
  ipAddress: string;
  subnetMask: string;
  defaultGateway: string;
  macAddress: string;
  dhcpEnabled: boolean;
  dnsServer1: string;
  dnsServer2: string;
  modbusTcpPort: number;
  maxTcpSessions: number;
  snmpEnabled: boolean;
  snmpVersion: string;
  readCommunity: string;
  writeCommunity: string;
  trapServer: string;
  webConsoleEnabled: boolean;
  telnetConsoleEnabled: boolean;
  hasRawCfg: boolean;
  importedAt: string;
  importedBy: string;
  serialPorts: MgateSerialPort[];
}

export function listMgateConfigs() {
  return apiFetch<{ mgateConfigs: MgateConfigSummary[] }>("/mgate-configs");
}

export function listSupportedMoxaModels() {
  return apiFetch<{ hardwareModels: SupportedMoxaModel[] }>("/mgate-configs/supported-models");
}

export function getMgateConfig(id: number) {
  return apiFetch<{ mgateConfig: MgateConfigDetail }>(`/mgate-configs/${id}`);
}

export function importMgateConfigCfg(file: File, hardwareModelId: number) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("hardwareModelId", String(hardwareModelId));
  return apiUpload<{ id: number; deviceName: string; ipAddress: string; message: string }>(
    "/mgate-configs/import-cfg",
    formData
  );
}

export function deleteMgateConfig(id: number) {
  return apiFetch<void>(`/mgate-configs/${id}`, { method: "DELETE" });
}

export async function downloadMgateConfigCfg(id: number) {
  const { blob, filename } = await apiDownload(`/mgate-configs/${id}/cfg`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
