// Format binaire propriétaire exporté/importé par MOXA MGateManager pour les passerelles
// MGate MB3480 (entête "MGate MODBUS Cfg vXX.XX.XX"). Non documenté publiquement — voir
// SwitchConfigApp/backend/SwitchConfig.API/Services/MoxaCfgParserService.cs (projet source dont
// ce module est un port direct) pour le détail de la rétro-ingénierie et la fiabilité par champ.

export interface ParsedMgateSlaveId {
  slaveNumberStart: number;
  slaveNumberEnd: number;
  modbusIdStart: number;
  modbusIdEnd: number;
}

export interface ParsedMgateSerialPort {
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
  slaveIds: ParsedMgateSlaveId[];
}

export interface ParsedMgateConfig {
  deviceName: string;
  ipAddress: string;
  subnetMask: string;
  defaultGateway: string;
  macAddress: string;
  modbusTcpPort: number;
  maxTcpSessions: number;
  snmpEnabled: boolean;
  readCommunity: string;
  serialPorts: ParsedMgateSerialPort[];
}

const EXPECTED_HEADER_PREFIX = "mgate modbus cfg";
const PASSWORD_FIELD_LENGTH = 17; // buffer à taille fixe, non préfixé par une longueur
const SERIAL_PORT_COUNT = 4;

const INTERFACES = ["RS-232", "RS-422", "RS-485-2W", "RS-485-4W"];
const DATA_BITS_BY_INDEX = [5, 6, 7, 8];

function requireLength(buf: Buffer, required: number, context: string) {
  if (buf.length < required) {
    throw new Error(`Fichier .cfg invalide : ${context}.`);
  }
}

function tryReadUInt32(buf: Buffer, pos: number): number | null {
  if (pos < 0 || pos + 4 > buf.length) return null;
  return buf.readUInt32LE(pos);
}

class CfgReader {
  pos = 0;
  constructor(private buf: Buffer) {}

  readCString(): string {
    const start = this.pos;
    while (this.pos < this.buf.length && this.buf[this.pos] !== 0) this.pos++;
    if (this.pos >= this.buf.length) {
      throw new Error("Fichier .cfg invalide : en-tête non terminé.");
    }
    const str = this.buf.toString("ascii", start, this.pos);
    this.pos++; // skip null terminator
    return str;
  }

  readLengthPrefixedString(): string {
    requireLength(this.buf, this.pos + 4, "chaîne préfixée tronquée");
    const len = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    requireLength(this.buf, this.pos + len, "chaîne préfixée tronquée");
    const str = this.buf.toString("ascii", this.pos, this.pos + len);
    this.pos += len;
    return str;
  }

  readIPv4(): string {
    requireLength(this.buf, this.pos + 4, "adresse IP tronquée");
    const ip = `${this.buf[this.pos]}.${this.buf[this.pos + 1]}.${this.buf[this.pos + 2]}.${this.buf[this.pos + 3]}`;
    this.pos += 4;
    return ip;
  }

  readMacAddress(): string {
    requireLength(this.buf, this.pos + 6, "adresse MAC tronquée");
    const mac = Array.from(this.buf.subarray(this.pos, this.pos + 6))
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(":");
    this.pos += 6;
    return mac;
  }
}

export function parseMoxaMgateCfg(buf: Buffer): ParsedMgateConfig {
  const reader = new CfgReader(buf);
  const header = reader.readCString();
  if (!header.toLowerCase().startsWith(EXPECTED_HEADER_PREFIX)) {
    throw new Error(`En-tête inattendu ("${header}") — ce fichier ne semble pas être un .cfg MGateManager.`);
  }

  const deviceName = reader.readLengthPrefixedString();
  reader.readLengthPrefixedString(); // identifiant de connexion — non stocké

  requireLength(buf, reader.pos + PASSWORD_FIELD_LENGTH + 26, "trop court pour contenir les paramètres réseau");
  reader.pos += PASSWORD_FIELD_LENGTH; // mot de passe en clair — volontairement ignoré, non stocké en base

  const ipAddress = reader.readIPv4();
  const subnetMask = reader.readIPv4();
  reader.pos += 8; // octets réservés entre le masque et la passerelle
  const defaultGateway = reader.readIPv4();
  const macAddress = reader.readMacAddress();

  const config: ParsedMgateConfig = {
    deviceName,
    ipAddress,
    subnetMask,
    defaultGateway,
    macAddress,
    modbusTcpPort: 502,
    maxTcpSessions: 16,
    snmpEnabled: false,
    readCommunity: "",
    serialPorts: [],
  };

  const portCount = tryReadUInt32(buf, reader.pos + 4);
  if (portCount === SERIAL_PORT_COUNT) {
    reader.pos += 8; // indicateur ProCOM (uint32) + nombre de ports série (uint32 == 4)
    for (let i = 0; i < SERIAL_PORT_COUNT; i++) {
      const port = tryReadSerialPortRecord(buf, reader, i + 1);
      if (!port) break;
      config.serialPorts.push(port);
    }
    applySlaveIdMap(buf, reader.pos, config.serialPorts);
  }

  const community = findSnmpCommunityName(buf);
  if (community !== null) {
    config.snmpEnabled = true;
    config.readCommunity = community;
  }

  return config;
}

// Enregistrement de 20 octets (5 x uint32 LE) par port : [interface, bitmask, stopBits, baudRate, dataBits].
// "bitmask" vaut 16 (FIFO activé, parité None) sur tous les échantillons observés — non décodé plus finement.
function tryReadSerialPortRecord(buf: Buffer, reader: CfgReader, portNumber: number): ParsedMgateSerialPort | null {
  const pos = reader.pos;
  const interfaceIdx = tryReadUInt32(buf, pos);
  if (interfaceIdx === null) return null;
  if (tryReadUInt32(buf, pos + 4) === null) return null; // bitmask non décodé (FIFO/parité)
  const stopBits = tryReadUInt32(buf, pos + 8);
  const baudRate = tryReadUInt32(buf, pos + 12);
  const dataBitsField = tryReadUInt32(buf, pos + 16);
  if (stopBits === null || baudRate === null || dataBitsField === null) return null;
  reader.pos += 20;

  return {
    portNumber,
    enabled: true,
    interface: interfaceIdx < INTERFACES.length ? INTERFACES[interfaceIdx] : "",
    baudRate,
    stopBits,
    dataBits: DATA_BITS_BY_INDEX[dataBitsField & 0x3],
    parity: "None", // observé à l'identique sur tous les échantillons — non décodé individuellement
    flowControl: "None", // idem
    protocol: "Modbus RTU", // observé (Mode = "RTU Slave") sur l'échantillon calibré — non décodé individuellement
    operationMode: "Slave Mode", // idem
    slaveIds: [],
  };
}

// Table "Slave ID Map" : 4 canaux (un par port série), chacun défini par une plage d'ID
// virtuel de 2 octets (début, fin). Le 1er canal est stocké tel quel ; les 3 suivants sont
// chacun précédés d'un marqueur (longueur=20, timeout=1000) qui sert de repère de recherche.
// La plage d'ID réel n'étant pas localisée séparément, elle est dérivée par convention en
// 1..N (N = largeur de la plage virtuelle).
function applySlaveIdMap(buf: Buffer, pos: number, ports: ParsedMgateSerialPort[]) {
  let marker = -1;
  for (let i = pos; i <= buf.length - 40 && i < pos + 300; i++) {
    if (tryReadUInt32(buf, i) === 20 && tryReadUInt32(buf, i + 4) === 1000) {
      marker = i;
      break;
    }
  }
  if (marker < 4) return;

  const channelOffsets = [marker - 4, marker + 8, marker + 20, marker + 32];
  const portList = [...ports].sort((a, b) => a.portNumber - b.portNumber);

  for (let ch = 0; ch < channelOffsets.length && ch < portList.length; ch++) {
    const offset = channelOffsets[ch];
    if (offset + 1 >= buf.length) continue;

    const virtualStart = buf[offset];
    const virtualEnd = buf[offset + 1];
    if (virtualEnd < virtualStart) continue;

    portList[ch].slaveIds.push({
      slaveNumberStart: virtualStart,
      slaveNumberEnd: virtualEnd,
      modbusIdStart: 1,
      modbusIdEnd: virtualEnd - virtualStart + 1,
    });
  }
}

// Nom de communauté SNMP : champ préfixé par une longueur de 32 octets, dont les 6 premiers
// octets sont un préfixe binaire (non décodé) suivi de 26 caractères hexadécimaux.
function findSnmpCommunityName(buf: Buffer): string | null {
  for (let i = 0; i <= buf.length - 36; i++) {
    if (tryReadUInt32(buf, i) !== 32) continue;
    const candidate = buf.toString("ascii", i + 4 + 6, i + 4 + 6 + 26);
    if (/^[0-9a-f]+$/.test(candidate)) return candidate;
  }
  return null;
}
