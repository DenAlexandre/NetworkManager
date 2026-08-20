import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";
import { parseMoxaSwitchXml } from "../services/moxaXmlParser";

const router = Router();
router.use(requireAuth, requirePermission("configurations"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Un parseur par modèle de switch supporté, identifié par (marque, nom) tels que définis dans le
// catalogue Type des données > Matériel. Un seul pour l'instant : chaque nouveau modèle nécessite
// son propre parseur (format de fichier différent) avant de pouvoir être ajouté ici.
const SWITCH_MODEL_PARSERS: Record<string, Record<string, (xmlContent: string) => ReturnType<typeof parseMoxaSwitchXml>>> = {
  HIRSCHMANN: { BRS30: parseMoxaSwitchXml },
};

async function findSwitchParser(hardwareModelId: number) {
  const result = await pool.query(
    `SELECT hm.name, b.name AS "brandName" FROM hardware_models hm
     JOIN brands b ON b.id = hm.brand_id WHERE hm.id = $1 AND hm.config_import_enabled = true`,
    [hardwareModelId]
  );
  const row = result.rows[0];
  const parser = row && SWITCH_MODEL_PARSERS[row.brandName]?.[row.name];
  return parser ?? null;
}

const STP_STATES: Record<number, string> = { 1: "Désactivé", 2: "Activé", 3: "Forwarding", 4: "Blocking" };
const LLDP_MODES: Record<number, string> = { 1: "Off", 2: "Rx", 3: "Tx", 4: "Tx+Rx" };
const MRP_ROLES: Record<number, string> = { 1: "MRM (Manager)", 2: "MRC (Client)", 3: "MRA (Auto)" };
const MRP_DELAYS: Record<number, string> = { 1: "500 ms", 2: "200 ms", 3: "30 ms" };

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function splitPorts(csv: string | null): string[] {
  return (csv ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

// Heuristique : les libellés/OID de type FX/SX/LX désignent un transceiver optique (fibre),
// tout le reste (TX/T/T4, OID inconnu...) est considéré comme du cuivre (TCP/IP).
function isFiberPort(speedLabel: string, mauTypeOid: string): boolean {
  return /FX|SX|LX/i.test(speedLabel || mauTypeOid || "");
}

router.get("/supported-models", async (_req, res) => {
  const result = await pool.query(
    `SELECT hm.id, hm.name, b.name AS "brandName"
     FROM hardware_models hm
     JOIN brands b ON b.id = hm.brand_id
     JOIN device_types dt ON dt.id = hm.device_type_id
     WHERE hm.config_import_enabled = true AND dt.name = 'Switch'
     ORDER BY b.name, hm.name`
  );
  res.json({ hardwareModels: result.rows });
});

router.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT s.id, s.sys_name AS "sysName", s.product_id AS "productId", s.firmware_version AS "firmwareVersion",
           s.sys_location AS "sysLocation", s.management_ip AS "managementIp", s.prefix_length AS "prefixLength",
           s.imported_at AS "importedAt", u.username AS "importedBy",
           s.hardware_model_id AS "hardwareModelId", hm.name AS "hardwareModelName", b.name AS "brandName",
           (SELECT count(*) FROM switch_vlans v WHERE v.switch_configuration_id = s.id) AS "vlanCount",
           (SELECT count(*) FROM switch_ports p WHERE p.switch_configuration_id = s.id) AS "portCount",
           (SELECT count(*) FROM switch_ports p
              WHERE p.switch_configuration_id = s.id AND p.admin_status = 1 AND p.power_state = 1) AS "activePortCount"
    FROM switch_configurations s
    JOIN users u ON u.id = s.imported_by_id
    JOIN hardware_models hm ON hm.id = s.hardware_model_id
    JOIN brands b ON b.id = hm.brand_id
    ORDER BY s.imported_at DESC
  `);
  res.json({ switchConfigs: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }

  const configResult = await pool.query(
    `SELECT s.*, u.username AS "importedByUsername", hm.name AS "hardwareModelName", b.name AS "brandName"
     FROM switch_configurations s
     JOIN users u ON u.id = s.imported_by_id
     JOIN hardware_models hm ON hm.id = s.hardware_model_id
     JOIN brands b ON b.id = hm.brand_id
     WHERE s.id = $1`,
    [id]
  );
  const config = configResult.rows[0];
  if (!config) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }

  const [vlansResult, portsResult, mrpResult] = await Promise.all([
    pool.query("SELECT * FROM switch_vlans WHERE switch_configuration_id = $1 ORDER BY vlan_index", [id]),
    pool.query("SELECT * FROM switch_ports WHERE switch_configuration_id = $1 ORDER BY id", [id]),
    pool.query("SELECT * FROM switch_mrp_configs WHERE switch_configuration_id = $1 ORDER BY id", [id]),
  ]);

  const vlans = vlansResult.rows.map((v) => {
    const egress = splitPorts(v.egress_ports);
    const untagged = splitPorts(v.untagged_ports);
    const tagged = egress.filter((p) => !untagged.includes(p));
    return {
      id: v.id,
      vlanIndex: v.vlan_index,
      name: v.name,
      egressPorts: v.egress_ports,
      forbiddenPorts: v.forbidden_ports,
      untaggedPorts: v.untagged_ports,
      taggedPortList: tagged,
      untaggedPortList: untagged,
    };
  });

  const ports = portsResult.rows.map((p) => ({
    id: p.id,
    portName: p.port_name,
    adminStatus: p.admin_status === 1 ? "Actif" : "Désactivé",
    powerState: p.power_state === 1 ? "ON" : "OFF",
    active: p.admin_status === 1 && p.power_state === 1,
    speedLabel: p.speed_label || "?",
    autoNeg: p.auto_neg_admin_status === 1,
    pvid: p.pvid,
    acceptableFrameTypes: p.acceptable_frame_types === 2 ? "Tagged seulement" : "Tous",
    stpState: STP_STATES[p.stp_port_state] ?? "—",
    lldpAdminStatus: LLDP_MODES[p.lldp_admin_status] ?? "—",
    mrpRole: p.mrp_role,
  }));

  const mrpConfigs = mrpResult.rows.map((m) => ({
    id: m.id,
    domainName: m.domain_name,
    ringPort1: m.ring_port1,
    ringPort2: m.ring_port2,
    role: MRP_ROLES[m.role_admin_state] ?? "?",
    recoveryDelay: MRP_DELAYS[m.recovery_delay] ?? "?",
    vlanId: m.vlan_id,
    mrmPriority: m.mrm_priority,
    active: m.row_status === 1,
    ringCouplingPort: m.ring_coupling_port,
    ringCouplingActive: m.ring_coupling_row_status === 1,
  }));

  res.json({
    switchConfig: {
      id: config.id,
      hardwareModelId: config.hardware_model_id,
      hardwareModelName: config.hardwareModelName,
      brandName: config.brandName,
      productId: config.product_id,
      firmwareVersion: config.firmware_version,
      sysName: config.sys_name,
      sysContact: config.sys_contact,
      sysLocation: config.sys_location,
      managementIp: config.management_ip,
      prefixLength: config.prefix_length,
      gatewayIp: config.gateway_ip,
      managementVlanId: config.management_vlan_id,
      importedAt: config.imported_at,
      importedBy: config.importedByUsername,
      vlans,
      ports,
      mrpConfigs,
    },
  });
});

router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier fourni." });
  }
  if (!req.file.originalname.toLowerCase().endsWith(".xml")) {
    return res.status(400).json({ error: "Le fichier doit être au format XML." });
  }
  const hardwareModelId = parseId(req.body.hardwareModelId);
  if (hardwareModelId === null) {
    return res.status(400).json({ error: "Le modèle de switch est requis." });
  }
  const parser = await findSwitchParser(hardwareModelId);
  if (!parser) {
    return res.status(400).json({ error: "Modèle de switch non supporté." });
  }

  const xmlContent = req.file.buffer.toString("utf-8");

  let parsed;
  try {
    parsed = parser(xmlContent);
  } catch (err) {
    return res.status(400).json({ error: `Erreur de parsing XML : ${(err as Error).message}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO switch_configurations
        (hardware_model_id, product_id, firmware_version, sys_name, sys_contact, sys_location, management_ip,
         prefix_length, gateway_ip, management_vlan_id, raw_xml, imported_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        hardwareModelId,
        parsed.productId,
        parsed.firmwareVersion,
        parsed.sysName,
        parsed.sysContact,
        parsed.sysLocation,
        parsed.managementIp,
        parsed.prefixLength,
        parsed.gatewayIp,
        parsed.managementVlanId,
        xmlContent,
        req.user!.id,
      ]
    );
    const configId = inserted.rows[0].id;

    for (const v of parsed.vlans) {
      await client.query(
        `INSERT INTO switch_vlans (switch_configuration_id, vlan_index, name, egress_ports, forbidden_ports, untagged_ports)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [configId, v.vlanIndex, v.name, v.egressPorts, v.forbiddenPorts, v.untaggedPorts]
      );
    }
    for (const p of parsed.ports) {
      await client.query(
        `INSERT INTO switch_ports
          (switch_configuration_id, port_name, admin_status, power_state, auto_power_down, cable_crossing,
           mau_type_oid, speed_label, auto_neg_admin_status, pvid, acceptable_frame_types, ingress_filtering,
           stp_port_state, lldp_admin_status, mrp_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          configId,
          p.portName,
          p.adminStatus,
          p.powerState,
          p.autoPowerDown,
          p.cableCrossing,
          p.mauTypeOid,
          p.speedLabel,
          p.autoNegAdminStatus,
          p.pvid,
          p.acceptableFrameTypes,
          p.ingressFiltering,
          p.stpPortState,
          p.lldpAdminStatus,
          p.mrpRole,
        ]
      );
    }
    for (const m of parsed.mrpConfigs) {
      await client.query(
        `INSERT INTO switch_mrp_configs
          (switch_configuration_id, domain_name, ring_port1, ring_port2, role_admin_state, recovery_delay,
           vlan_id, mrm_priority, row_status, ring_coupling_port, ring_coupling_row_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          configId,
          m.domainName,
          m.ringPort1,
          m.ringPort2,
          m.roleAdminState,
          m.recoveryDelay,
          m.vlanId,
          m.mrmPriority,
          m.rowStatus,
          m.ringCouplingPort,
          m.ringCouplingRowStatus,
        ]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      id: configId,
      sysName: parsed.sysName,
      managementIp: parsed.managementIp,
      message: "Import réussi.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM switch_configurations WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }
  res.status(204).send();
});

router.get("/:id/xml", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("SELECT sys_name, raw_xml FROM switch_configurations WHERE id = $1", [id]);
  const config = result.rows[0];
  if (!config) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }
  res.setHeader("Content-Disposition", `attachment; filename="${config.sys_name || "switch"}.xml"`);
  res.type("application/xml").send(config.raw_xml);
});

/** Convertit une longueur de préfixe CIDR (ex. 24) en masque décimal pointé (ex. "255.255.255.0"). */
function prefixToSubnetMask(prefixLength: number): string | null {
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) return null;
  const bits = "1".repeat(prefixLength).padEnd(32, "0");
  const octets = [0, 1, 2, 3].map((i) => Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2));
  return octets.join(".");
}

function blank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Répercute une configuration importée sur le matériel (Gestion du matériel) : crée ou met à jour
// l'équipement correspondant (nommé d'après le sysName du switch), crée au passage les ports du
// modèle de catalogue qui manqueraient encore, et configure chaque port (VLAN, et adresse IP/passerelle/
// masque de gestion sur le port qui porte le VLAN de management).
router.post("/:id/apply-to-equipment", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }

  const configResult = await pool.query(
    `SELECT hardware_model_id AS "hardwareModelId", sys_name AS "sysName", sys_location AS "sysLocation",
            management_ip AS "managementIp", gateway_ip AS "gatewayIp", prefix_length AS "prefixLength",
            management_vlan_id AS "managementVlanId"
     FROM switch_configurations WHERE id = $1`,
    [id]
  );
  const config = configResult.rows[0];
  if (!config) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }
  if (!config.sysName) {
    return res.status(400).json({ error: "Cette configuration n'a pas de nom (sysName) exploitable." });
  }

  const portsResult = await pool.query(
    `SELECT port_name AS "portName", mau_type_oid AS "mauTypeOid", speed_label AS "speedLabel", pvid
     FROM switch_ports WHERE switch_configuration_id = $1 ORDER BY id`,
    [id]
  );
  if (!portsResult.rowCount) {
    return res.status(400).json({ error: "Cette configuration ne contient aucun port." });
  }

  const hardwareModelResult = await pool.query(
    "SELECT device_type_id AS \"deviceTypeId\" FROM hardware_models WHERE id = $1",
    [config.hardwareModelId]
  );
  const hardwareModel = hardwareModelResult.rows[0];
  if (!hardwareModel) {
    return res.status(404).json({ error: "Modèle de catalogue introuvable." });
  }

  const linkTypesResult = await pool.query("SELECT id, name FROM link_types WHERE name IN ('Fibre', 'TCP/IP')");
  const fiberLinkTypeId = linkTypesResult.rows.find((r) => r.name === "Fibre")?.id;
  const copperLinkTypeId = linkTypesResult.rows.find((r) => r.name === "TCP/IP")?.id;
  if (!fiberLinkTypeId || !copperLinkTypeId) {
    return res.status(400).json({
      error: "Les types de liaison \"Fibre\" et \"TCP/IP\" doivent exister dans le catalogue (Type des données).",
    });
  }

  const existingPortsResult = await pool.query(
    "SELECT id, label FROM hardware_model_ports WHERE hardware_model_id = $1",
    [config.hardwareModelId]
  );
  const portIdByLabel = new Map<string, number>(existingPortsResult.rows.map((r) => [r.label, r.id]));
  const validExistingPortIds = new Set<number>(existingPortsResult.rows.map((r) => r.id));

  // Correspondances déjà résolues manuellement pour ce modèle par une précédente configuration
  // (voir POST .../apply-to-equipment ci-dessous) : appliquées automatiquement, sans re-demander.
  const aliasesResult = await pool.query(
    "SELECT source_label AS \"sourceLabel\", hardware_model_port_id AS \"hardwareModelPortId\" FROM hardware_model_port_aliases WHERE hardware_model_id = $1",
    [config.hardwareModelId]
  );
  for (const alias of aliasesResult.rows) {
    if (!portIdByLabel.has(alias.sourceLabel)) {
      portIdByLabel.set(alias.sourceLabel, alias.hardwareModelPortId);
    }
  }

  const unmatchedPorts = portsResult.rows.filter((p) => !portIdByLabel.has(p.portName));

  const rawPortMapping = req.body?.portMapping;
  const portMapping: Record<string, string> =
    rawPortMapping && typeof rawPortMapping === "object" ? rawPortMapping : {};

  if (unmatchedPorts.length > 0) {
    const missing = unmatchedPorts.filter((p) => portMapping[p.portName] === undefined);
    if (missing.length > 0) {
      return res.json({
        requiresPortMapping: true,
        unmatchedPorts: unmatchedPorts.map((p) => ({
          portName: p.portName,
          suggestedLinkType: isFiberPort(p.speedLabel, p.mauTypeOid) ? "Fibre" : "TCP/IP",
        })),
        availablePorts: existingPortsResult.rows.map((r) => ({ id: r.id, label: r.label })),
      });
    }

    const usedTargetIds = new Set<number>();
    for (const p of unmatchedPorts) {
      const mapped = portMapping[p.portName];
      if (mapped === "new") continue;
      const targetId = Number(mapped);
      if (!Number.isInteger(targetId) || !validExistingPortIds.has(targetId)) {
        return res.status(400).json({ error: `Port sélectionné invalide pour "${p.portName}".` });
      }
      if (usedTargetIds.has(targetId)) {
        return res.status(400).json({
          error: "Impossible d'associer plusieurs ports de la configuration au même port du catalogue.",
        });
      }
      usedTargetIds.add(targetId);
    }
  }

  const existingEquipmentResult = await pool.query(
    "SELECT id, room_id AS \"roomId\" FROM equipment WHERE name = $1",
    [config.sysName]
  );
  if (existingEquipmentResult.rowCount && existingEquipmentResult.rowCount > 1) {
    return res.status(409).json({
      error: `Plusieurs équipements portent déjà le nom "${config.sysName}", mise à jour impossible.`,
    });
  }
  const existingEquipment = existingEquipmentResult.rows[0] ?? null;

  const rawRoomId = req.body?.roomId;
  let roomId: number | null = typeof rawRoomId === "number" && Number.isInteger(rawRoomId) ? rawRoomId : null;
  if (roomId === null) {
    if (existingEquipment) {
      roomId = existingEquipment.roomId;
    } else if (config.sysLocation) {
      const roomMatchResult = await pool.query("SELECT id FROM rooms WHERE lower(name) = lower($1)", [
        config.sysLocation,
      ]);
      if (roomMatchResult.rowCount === 1) {
        roomId = roomMatchResult.rows[0].id;
      }
    }
  }

  if (roomId === null) {
    const roomsResult = await pool.query(
      `SELECT r.id, r.name, z.name AS "zoneName", s.name AS "siteName"
       FROM rooms r JOIN zones z ON z.id = r.zone_id JOIN sites s ON s.id = z.site_id
       ORDER BY s.name, z.name, r.name`
    );
    return res.json({ requiresRoomSelection: true, rooms: roomsResult.rows });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let createdPortCount = 0;
    for (const p of unmatchedPorts) {
      const mapped = portMapping[p.portName];
      if (mapped !== "new") {
        const targetId = Number(mapped);
        portIdByLabel.set(p.portName, targetId);
        // Mémorise ce choix pour ce modèle : les futures configurations avec ce même nom de port
        // n'auront plus besoin de redemander à l'admin (voir la fusion des alias plus haut).
        await client.query(
          `INSERT INTO hardware_model_port_aliases (hardware_model_id, source_label, hardware_model_port_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (hardware_model_id, source_label) DO UPDATE SET hardware_model_port_id = $3`,
          [config.hardwareModelId, p.portName, targetId]
        );
        continue;
      }
      const linkTypeId = isFiberPort(p.speedLabel, p.mauTypeOid) ? fiberLinkTypeId : copperLinkTypeId;
      const inserted = await client.query(
        "INSERT INTO hardware_model_ports (hardware_model_id, link_type_id, label) VALUES ($1, $2, $3) RETURNING id",
        [config.hardwareModelId, linkTypeId, p.portName]
      );
      portIdByLabel.set(p.portName, inserted.rows[0].id);
      createdPortCount++;
    }

    let equipmentId: number;
    if (existingEquipment) {
      await client.query(
        "UPDATE equipment SET room_id = $1, device_type_id = $2, hardware_model_id = $3 WHERE id = $4",
        [roomId, hardwareModel.deviceTypeId, config.hardwareModelId, existingEquipment.id]
      );
      equipmentId = existingEquipment.id;
    } else {
      const insertedEquipment = await client.query(
        "INSERT INTO equipment (room_id, device_type_id, hardware_model_id, name) VALUES ($1, $2, $3, $4) RETURNING id",
        [roomId, hardwareModel.deviceTypeId, config.hardwareModelId, config.sysName]
      );
      equipmentId = insertedEquipment.rows[0].id;
    }

    const subnetMask = prefixToSubnetMask(config.prefixLength);
    for (const p of portsResult.rows) {
      const hardwareModelPortId = portIdByLabel.get(p.portName)!;
      const isManagementPort =
        !!config.managementVlanId && p.pvid === config.managementVlanId && !!blank(config.managementIp);
      await client.query(
        `INSERT INTO equipment_port_settings
           (equipment_id, hardware_model_port_id, modbus_address, vlan, ip_address, gateway, subnet_mask)
         VALUES ($1, $2, NULL, $3, $4, $5, $6)
         ON CONFLICT (equipment_id, hardware_model_port_id)
         DO UPDATE SET modbus_address = NULL, vlan = $3, ip_address = $4, gateway = $5, subnet_mask = $6`,
        [
          equipmentId,
          hardwareModelPortId,
          blank(p.pvid ? String(p.pvid) : null),
          isManagementPort ? blank(config.managementIp) : null,
          isManagementPort ? blank(config.gatewayIp) : null,
          isManagementPort ? subnetMask : null,
        ]
      );
    }

    await client.query("COMMIT");
    res.json({
      equipmentId,
      equipmentName: config.sysName,
      roomId,
      created: !existingEquipment,
      portCount: portsResult.rowCount,
      createdPortCount,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Salle, type de matériel ou modèle introuvable." });
    }
    throw err;
  } finally {
    client.release();
  }
});

export default router;
