import { XMLParser } from "fast-xml-parser";

const NS_MARKER = "mibconf";

// These tags can repeat as siblings under the same parent; force them to always parse as
// arrays (fast-xml-parser otherwise collapses a single occurrence to a bare object).
const REPEATABLE_TAGS = new Set(["Variable", "MIB", "Scalar", "Table", "Entry", "Attribute"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => REPEATABLE_TAGS.has(name),
});

const MAU_TYPES: Record<string, string> = {
  "1.3.6.1.2.1.26.4.26": "100TX",
  "1.3.6.1.2.1.26.4.16": "10T",
  "1.3.6.1.2.1.26.4.36": "1000T",
  "1.3.6.1.2.1.26.4.30": "100FX",
  "1.3.6.1.2.1.26.4.32": "1000SX",
  "1.3.6.1.2.1.26.4.33": "1000LX",
};

const MRP_ROLES: Record<string, string> = {
  "1": "MRM (Manager)",
  "2": "MRC (Client)",
  "3": "MRA (Auto)",
};

export interface ParsedVlan {
  vlanIndex: number;
  name: string;
  egressPorts: string;
  forbiddenPorts: string;
  untaggedPorts: string;
}

export interface ParsedSwitchPort {
  portName: string;
  adminStatus: number;
  powerState: number;
  autoPowerDown: number;
  cableCrossing: number;
  mauTypeOid: string;
  speedLabel: string;
  autoNegAdminStatus: number;
  pvid: number;
  acceptableFrameTypes: number;
  ingressFiltering: number;
  stpPortState: number;
  lldpAdminStatus: number;
  mrpRole: string;
}

export interface ParsedMrpConfig {
  domainName: string;
  ringPort1: string;
  ringPort2: string;
  roleAdminState: number;
  recoveryDelay: number;
  vlanId: number;
  mrmPriority: number;
  rowStatus: number;
  ringCouplingPort: string;
  ringCouplingRowStatus: number;
}

export interface ParsedSwitchConfig {
  productId: string;
  firmwareVersion: string;
  sysName: string;
  sysContact: string;
  sysLocation: string;
  managementIp: string;
  prefixLength: number;
  gatewayIp: string;
  managementVlanId: number;
  vlans: ParsedVlan[];
  ports: ParsedSwitchPort[];
  mrpConfigs: ParsedMrpConfig[];
}

type AttrMap = Record<string, string>;

function attrText(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["#text"]).trim();
  }
  return "";
}

function toAttrMap(attributes: unknown[] | undefined): AttrMap {
  const map: AttrMap = {};
  for (const a of attributes ?? []) {
    const name = (a as Record<string, unknown>)["@_name"];
    if (typeof name === "string" && name) map[name] = attrText(a);
  }
  return map;
}

function findMib(mibData: any, mibName: string): any {
  const mibs: any[] = mibData?.MIB ?? [];
  return mibs.find((m) => m["@_name"] === mibName);
}

function findScalar(mibData: any, mibName: string, scalarName: string): AttrMap {
  const mib = findMib(mibData, mibName);
  const scalar = (mib?.Scalar ?? []).find((s: any) => s["@_name"] === scalarName);
  return toAttrMap(scalar?.Attribute);
}

function findTable(mibData: any, mibName: string, tableName: string): AttrMap[] {
  const mib = findMib(mibData, mibName);
  const table = (mib?.Table ?? []).find((t: any) => t["@_name"] === tableName);
  const entries: any[] = table?.Entry ?? [];
  return entries.map((e) => toAttrMap(e.Attribute));
}

/** Convertit "AC 12 20 C3" en "172.18.32.195". */
function hexToIpv4(hex: string): string {
  if (!hex.trim()) return "";
  const bytes = hex.trim().split(/\s+/).filter(Boolean);
  if (bytes.length !== 4) return hex;
  try {
    return bytes.map((b) => parseInt(b, 16)).join(".");
  } catch {
    return hex;
  }
}

/** Decode "47 54 42 2D 32" en "GTB-2" (paires hexa ASCII). */
function hexToAscii(hex: string): string {
  if (!hex.trim()) return "";
  try {
    const bytes = hex.trim().split(/\s+/).filter(Boolean);
    const chars = bytes.map((b) => String.fromCharCode(parseInt(b, 16)));
    return chars.join("").replace(/\0/g, "").trim();
  } catch {
    return hex;
  }
}

function toInt(value: string | undefined, fallback = 0): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

function portSortRank(port: string): number {
  const parts = port.split("/");
  if (parts.length === 2) {
    const a = Number.parseInt(parts[0], 10);
    const b = Number.parseInt(parts[1], 10);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return a * 1000 + b;
  }
  return 0;
}

/** Parse le format XML MOXA BRS30 (namespace urn:xml:ns:mibconf:base:1.0). */
export function parseMoxaSwitchXml(xmlContent: string): ParsedSwitchConfig {
  const doc = parser.parse(xmlContent);
  const rootKey = Object.keys(doc).find((k) => k !== "?xml");
  if (!rootKey) throw new Error("XML invalide : élément racine manquant.");
  const root = doc[rootKey];

  const rootNs = String(root?.["@_xmlns"] ?? "");
  if (!rootNs.includes(NS_MARKER)) {
    throw new Error("Format XML non reconnu. Ce fichier ne semble pas être une configuration MOXA BRS.");
  }

  const header = toAttrMap(root.Header?.Variable);
  const firmware = `${header.swMajorRelNum ?? "?"}.${header.swMinorRelNum ?? "?"}.${header.swBugfixRelNum ?? "?"}`;

  const mibData = root.MibData;

  const sys = findScalar(mibData, "SNMPv2-MIB", "system");
  const net = findScalar(mibData, "HM2-NETCONFIG-MIB", "hm2NetStaticGroup");
  const managementIp = hexToIpv4(net.hm2NetLocalIPAddr ?? "");
  const gatewayIp = hexToIpv4(net.hm2NetGatewayIPAddr ?? "");

  const config: ParsedSwitchConfig = {
    productId: header.productId ?? "",
    firmwareVersion: firmware,
    sysName: sys.sysName ?? "",
    sysContact: sys.sysContact ?? "",
    sysLocation: sys.sysLocation ?? "",
    managementIp,
    prefixLength: toInt(net.hm2NetPrefixLength),
    gatewayIp,
    managementVlanId: toInt(net.hm2NetVlanID),
    vlans: [],
    ports: [],
    mrpConfigs: [],
  };

  const ifEntries = new Map(findTable(mibData, "IF-MIB", "ifEntry").map((e) => [e.ifIndex ?? "", e]));
  const mauEntries = new Map(findTable(mibData, "MAU-MIB", "ifMauEntry").map((e) => [e.ifMauIfIndex ?? "", e]));
  const autoNegEntries = new Map(
    findTable(mibData, "MAU-MIB", "ifMauAutoNegEntry").map((e) => [e.ifMauIfIndex ?? "", e])
  );
  const ifaceEntries = new Map(
    findTable(mibData, "HM2-DEVMGMT-MIB", "hm2IfaceEntry").map((e) => [e.hm2IfacePhysIndex ?? "", e])
  );
  const portVlanEntries = new Map(
    findTable(mibData, "Q-BRIDGE-MIB", "dot1qPortVlanEntry").map((e) => [e.dot1dBasePort ?? "", e])
  );
  const stpPortEntries = new Map(
    findTable(mibData, "HM2-PLATFORM-SWITCHING-MIB", "hm2AgentStpPortEntry").map((e) => [e.ifIndex ?? "", e])
  );
  const lldpPortEntries = new Map(
    findTable(mibData, "LLDP-MIB", "lldpPortConfigEntry")
      .slice(0, 12) // première table seulement (lldpPortConfigEntry)
      .map((e) => [e.lldpPortConfigPortNum ?? "", e])
  );

  const mrpEntries = findTable(mibData, "HM2-L2REDUNDANCY-MIB", "hm2MrpEntry");
  const ringEntries = findTable(mibData, "HM2-L2REDUNDANCY-MIB", "hm2RingCouplingEntry");

  const mrpPortRoles = new Map<string, string>();
  for (const m of mrpEntries) {
    const roleLabel = MRP_ROLES[m.hm2MrpRoleAdminState ?? ""] ?? "MRP";
    const p1 = m.hm2MrpRingport1IfIndex ?? "";
    const p2 = m.hm2MrpRingport2IfIndex ?? "";
    if (p1) mrpPortRoles.set(p1, `${roleLabel} P1`);
    if (p2) mrpPortRoles.set(p2, `${roleLabel} P2`);
  }
  const ringCouplingPorts = new Set<string>();
  for (const rc of ringEntries) {
    const port = rc.hm2RingCplInterconnIfIndex ?? "";
    if (port && !port.startsWith("not-available")) ringCouplingPorts.add(port);
  }

  const allPorts = [...ifEntries.keys()]
    .filter((p) => !p.startsWith("cpu"))
    .sort((a, b) => portSortRank(a) - portSortRank(b));

  for (const port of allPorts) {
    const ife = ifEntries.get(port) ?? {};
    const mau = mauEntries.get(port) ?? {};
    const ang = autoNegEntries.get(port) ?? {};
    const ifa = ifaceEntries.get(port) ?? {};
    const pv = portVlanEntries.get(port) ?? {};
    const stp = stpPortEntries.get(port) ?? {};
    const lldp = lldpPortEntries.get(port) ?? {};

    const mauOid = mau.ifMauDefaultType ?? "";
    let mrpRole = mrpPortRoles.get(port) ?? "";
    if (ringCouplingPorts.has(port)) {
      mrpRole = mrpRole ? `${mrpRole} | Ring Coupling` : "Ring Coupling";
    }

    config.ports.push({
      portName: port,
      adminStatus: toInt(ife.ifAdminStatus),
      powerState: toInt(ifa.hm2IfacePowerState),
      autoPowerDown: toInt(ifa.hm2IfaceAutoPowerDown),
      cableCrossing: toInt(ifa.hm2IfaceCableCrossing),
      mauTypeOid: mauOid,
      speedLabel: MAU_TYPES[mauOid] ?? mauOid,
      autoNegAdminStatus: toInt(ang.ifMauAutoNegAdminStatus),
      pvid: toInt(pv.dot1qPvid),
      acceptableFrameTypes: toInt(pv.dot1qPortAcceptableFrameTypes),
      ingressFiltering: toInt(pv.dot1qPortIngressFiltering),
      stpPortState: toInt(stp.hm2AgentStpPortState),
      lldpAdminStatus: toInt(lldp.lldpPortConfigAdminStatus),
      mrpRole,
    });
  }

  for (const v of findTable(mibData, "Q-BRIDGE-MIB", "dot1qVlanStaticEntry")) {
    if (!v.dot1qVlanIndex) continue;
    const vlanIndex = Number.parseInt(v.dot1qVlanIndex, 10);
    if (Number.isNaN(vlanIndex)) continue;
    config.vlans.push({
      vlanIndex,
      name: hexToAscii(v.dot1qVlanStaticName ?? ""),
      egressPorts: v.dot1qVlanStaticEgressPorts ?? "",
      forbiddenPorts: v.dot1qVlanForbiddenEgressPorts ?? "",
      untaggedPorts: v.dot1qVlanStaticUntaggedPorts ?? "",
    });
  }

  const firstRingEntry = ringEntries[0];
  for (const m of mrpEntries) {
    let couplingPort = "";
    let couplingRowStatus = 0;
    if (firstRingEntry) {
      couplingPort = firstRingEntry.hm2RingCplInterconnIfIndex ?? "";
      if (couplingPort.startsWith("not-available")) couplingPort = "";
      couplingRowStatus = toInt(firstRingEntry.hm2RingCplRowStatus);
    }
    config.mrpConfigs.push({
      domainName: hexToAscii(m.hm2MrpDomainName ?? ""),
      ringPort1: m.hm2MrpRingport1IfIndex ?? "",
      ringPort2: m.hm2MrpRingport2IfIndex ?? "",
      roleAdminState: toInt(m.hm2MrpRoleAdminState),
      recoveryDelay: toInt(m.hm2MrpRecoveryDelay),
      vlanId: toInt(m.hm2MrpVlanID),
      mrmPriority: toInt(m.hm2MrpMRMPriority),
      rowStatus: toInt(m.hm2MrpRowStatus),
      ringCouplingPort: couplingPort,
      ringCouplingRowStatus: couplingRowStatus,
    });
  }

  return config;
}
