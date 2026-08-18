import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { parseMoxaSwitchXml } from "../services/moxaXmlParser";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Un parseur par modèle de switch supporté. Un seul pour l'instant : chaque nouveau modèle
// nécessite son propre parseur (format de fichier différent) avant de pouvoir être ajouté ici.
const SWITCH_MODEL_PARSERS: Record<string, (xmlContent: string) => ReturnType<typeof parseMoxaSwitchXml>> = {
  "hirschmann-brs30": parseMoxaSwitchXml,
};

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

router.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT s.id, s.sys_name AS "sysName", s.product_id AS "productId", s.firmware_version AS "firmwareVersion",
           s.sys_location AS "sysLocation", s.management_ip AS "managementIp", s.prefix_length AS "prefixLength",
           s.imported_at AS "importedAt", u.username AS "importedBy",
           (SELECT count(*) FROM switch_vlans v WHERE v.switch_configuration_id = s.id) AS "vlanCount",
           (SELECT count(*) FROM switch_ports p WHERE p.switch_configuration_id = s.id) AS "portCount",
           (SELECT count(*) FROM switch_ports p
              WHERE p.switch_configuration_id = s.id AND p.admin_status = 1 AND p.power_state = 1) AS "activePortCount"
    FROM switch_configurations s
    JOIN users u ON u.id = s.imported_by_id
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
    `SELECT s.*, u.username AS "importedByUsername" FROM switch_configurations s
     JOIN users u ON u.id = s.imported_by_id WHERE s.id = $1`,
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
  const parser = SWITCH_MODEL_PARSERS[req.body.model];
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
        (product_id, firmware_version, sys_name, sys_contact, sys_location, management_ip,
         prefix_length, gateway_ip, management_vlan_id, raw_xml, imported_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
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

export default router;
