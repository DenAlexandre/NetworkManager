import { apiDownload, apiFetch, apiUpload } from "./client";

export interface SwitchConfigSummary {
  id: number;
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

export function getSwitchConfig(id: number) {
  return apiFetch<{ switchConfig: SwitchConfigDetail }>(`/switch-configs/${id}`);
}

export function importSwitchConfig(file: File, model: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);
  return apiUpload<{ id: number; sysName: string; managementIp: string; message: string }>(
    "/switch-configs/import",
    formData
  );
}

export function deleteSwitchConfig(id: number) {
  return apiFetch<void>(`/switch-configs/${id}`, { method: "DELETE" });
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
