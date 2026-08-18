import { apiDownload, apiFetch, apiUpload } from "./client";

export interface SwitchConfigSummary {
  id: number;
  hardwareModelId: number;
  hardwareModelName: string;
  brandName: string;
  sysName: string;
  productId: string;
  firmwareVersion: string;
  sysLocation: string;
  managementIp: string;
  prefixLength: number;
  importedAt: string;
  importedBy: string;
  vlanCount: number;
  portCount: number;
  activePortCount: number;
}

export interface SupportedSwitchModel {
  id: number;
  name: string;
  brandName: string;
}

export interface SwitchVlan {
  id: number;
  vlanIndex: number;
  name: string;
  egressPorts: string;
  forbiddenPorts: string;
  untaggedPorts: string;
  taggedPortList: string[];
  untaggedPortList: string[];
}

export interface SwitchPort {
  id: number;
  portName: string;
  adminStatus: string;
  powerState: string;
  active: boolean;
  speedLabel: string;
  autoNeg: boolean;
  pvid: number;
  acceptableFrameTypes: string;
  stpState: string;
  lldpAdminStatus: string;
  mrpRole: string;
}

export interface SwitchMrpConfig {
  id: number;
  domainName: string;
  ringPort1: string;
  ringPort2: string;
  role: string;
  recoveryDelay: string;
  vlanId: number;
  mrmPriority: number;
  active: boolean;
  ringCouplingPort: string;
  ringCouplingActive: boolean;
}

export interface SwitchConfigDetail {
  id: number;
  hardwareModelId: number;
  hardwareModelName: string;
  brandName: string;
  productId: string;
  firmwareVersion: string;
  sysName: string;
  sysContact: string;
  sysLocation: string;
  managementIp: string;
  prefixLength: number;
  gatewayIp: string;
  managementVlanId: number;
  importedAt: string;
  importedBy: string;
  vlans: SwitchVlan[];
  ports: SwitchPort[];
  mrpConfigs: SwitchMrpConfig[];
}

export function listSwitchConfigs() {
  return apiFetch<{ switchConfigs: SwitchConfigSummary[] }>("/switch-configs");
}

export function listSupportedSwitchModels() {
  return apiFetch<{ hardwareModels: SupportedSwitchModel[] }>("/switch-configs/supported-models");
}

export function getSwitchConfig(id: number) {
  return apiFetch<{ switchConfig: SwitchConfigDetail }>(`/switch-configs/${id}`);
}

export function importSwitchConfig(file: File, hardwareModelId: number) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("hardwareModelId", String(hardwareModelId));
  return apiUpload<{ id: number; sysName: string; managementIp: string; message: string }>(
    "/switch-configs/import",
    formData
  );
}

export function deleteSwitchConfig(id: number) {
  return apiFetch<void>(`/switch-configs/${id}`, { method: "DELETE" });
}

export interface RoomOption {
  id: number;
  name: string;
  zoneName: string;
  siteName: string;
}

export interface ApplySwitchConfigResult {
  requiresRoomSelection?: boolean;
  rooms?: RoomOption[];
  equipmentId?: number;
  equipmentName?: string;
  roomId?: number;
  created?: boolean;
  portCount?: number;
  createdPortCount?: number;
}

export function applySwitchConfigToEquipment(id: number, roomId?: number) {
  return apiFetch<ApplySwitchConfigResult>(`/switch-configs/${id}/apply-to-equipment`, {
    method: "POST",
    body: JSON.stringify({ roomId }),
  });
}

export async function downloadSwitchConfigXml(id: number) {
  const { blob, filename } = await apiDownload(`/switch-configs/${id}/xml`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
