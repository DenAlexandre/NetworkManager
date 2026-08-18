import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { parseMoxaMgateCfg } from "../services/moxaCfgParser";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Un parseur par modèle de passerelle Moxa supporté, identifié par (marque, nom) tels que définis
// dans le catalogue Type des données > Matériel. Un seul pour l'instant : chaque nouveau modèle
// nécessite son propre parseur (format de fichier différent) avant de pouvoir être ajouté ici.
const MOXA_MODEL_PARSERS: Record<string, Record<string, (buf: Buffer) => ReturnType<typeof parseMoxaMgateCfg>>> = {
  MOXA: { "MGate 3480": parseMoxaMgateCfg },
};

async function findMoxaParser(hardwareModelId: number) {
  const result = await pool.query(
    `SELECT hm.name, b.name AS "brandName" FROM hardware_models hm
     JOIN brands b ON b.id = hm.brand_id WHERE hm.id = $1 AND hm.config_import_enabled = true`,
    [hardwareModelId]
  );
  const row = result.rows[0];
  const parser = row && MOXA_MODEL_PARSERS[row.brandName]?.[row.name];
  return parser ?? null;
}

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/supported-models", async (_req, res) => {
  const pairs = Object.entries(MOXA_MODEL_PARSERS).flatMap(([brandName, models]) =>
    Object.keys(models).map((modelName) => ({ brandName, modelName }))
  );
  if (!pairs.length) {
    return res.json({ hardwareModels: [] });
  }
  const conditions = pairs.map((_, i) => `(b.name = $${i * 2 + 1} AND hm.name = $${i * 2 + 2})`).join(" OR ");
  const params = pairs.flatMap((p) => [p.brandName, p.modelName]);
  const result = await pool.query(
    `SELECT hm.id, hm.name, b.name AS "brandName"
     FROM hardware_models hm
     JOIN brands b ON b.id = hm.brand_id
     WHERE hm.config_import_enabled = true AND (${conditions})
     ORDER BY b.name, hm.name`,
    params
  );
  res.json({ hardwareModels: result.rows });
});

router.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT g.id, g.device_name AS "deviceName", g.ip_address AS "ipAddress", g.location AS "location",
           g.imported_at AS "importedAt", u.username AS "importedBy",
           g.hardware_model_id AS "hardwareModelId", hm.name AS "hardwareModelName", b.name AS "brandName",
           (SELECT count(*) FROM mgate_serial_ports p WHERE p.mgate_configuration_id = g.id) AS "serialPortCount"
    FROM mgate_configurations g
    JOIN users u ON u.id = g.imported_by_id
    JOIN hardware_models hm ON hm.id = g.hardware_model_id
    JOIN brands b ON b.id = hm.brand_id
    ORDER BY g.imported_at DESC
  `);
  res.json({ mgateConfigs: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }

  const configResult = await pool.query(
    `SELECT g.*, u.username AS "importedByUsername", hm.name AS "hardwareModelName", b.name AS "brandName"
     FROM mgate_configurations g
     JOIN users u ON u.id = g.imported_by_id
     JOIN hardware_models hm ON hm.id = g.hardware_model_id
     JOIN brands b ON b.id = hm.brand_id
     WHERE g.id = $1`,
    [id]
  );
  const config = configResult.rows[0];
  if (!config) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }

  const portsResult = await pool.query(
    "SELECT * FROM mgate_serial_ports WHERE mgate_configuration_id = $1 ORDER BY port_number",
    [id]
  );
  const portIds = portsResult.rows.map((p) => p.id);
  const slaveIdsResult = portIds.length
    ? await pool.query(
        "SELECT * FROM mgate_slave_ids WHERE mgate_serial_port_id = ANY($1::int[]) ORDER BY slave_number_start",
        [portIds]
      )
    : { rows: [] as any[] };

  const serialPorts = portsResult.rows.map((p) => ({
    id: p.id,
    portNumber: p.port_number,
    enabled: p.enabled,
    interface: p.interface,
    baudRate: p.baud_rate,
    dataBits: p.data_bits,
    parity: p.parity,
    stopBits: p.stop_bits,
    flowControl: p.flow_control,
    protocol: p.protocol,
    operationMode: p.operation_mode,
    responseTimeout: p.response_timeout,
    recoveryTime: p.recovery_time,
    delayBetweenPoll: p.delay_between_poll,
    terminationEnabled: p.termination_enabled,
    pullHighLow: p.pull_high_low,
    slaveIds: slaveIdsResult.rows
      .filter((s) => s.mgate_serial_port_id === p.id)
      .map((s) => ({
        slaveNumberStart: s.slave_number_start,
        slaveNumberEnd: s.slave_number_end,
        modbusIdStart: s.modbus_id_start,
        modbusIdEnd: s.modbus_id_end,
      })),
  }));

  res.json({
    mgateConfig: {
      id: config.id,
      hardwareModelId: config.hardware_model_id,
      hardwareModelName: config.hardwareModelName,
      brandName: config.brandName,
      deviceName: config.device_name,
      description: config.description,
      location: config.location,
      contact: config.contact,
      ipAddress: config.ip_address,
      subnetMask: config.subnet_mask,
      defaultGateway: config.default_gateway,
      macAddress: config.mac_address,
      dhcpEnabled: config.dhcp_enabled,
      dnsServer1: config.dns_server1,
      dnsServer2: config.dns_server2,
      modbusTcpPort: config.modbus_tcp_port,
      maxTcpSessions: config.max_tcp_sessions,
      snmpEnabled: config.snmp_enabled,
      snmpVersion: config.snmp_version,
      readCommunity: config.read_community,
      writeCommunity: config.write_community,
      trapServer: config.trap_server,
      webConsoleEnabled: config.web_console_enabled,
      telnetConsoleEnabled: config.telnet_console_enabled,
      hasRawCfg: config.raw_cfg !== null,
      importedAt: config.imported_at,
      importedBy: config.importedByUsername,
      serialPorts,
    },
  });
});

router.post("/import-cfg", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier fourni." });
  }
  if (!req.file.originalname.toLowerCase().endsWith(".cfg")) {
    return res.status(400).json({ error: "Le fichier doit être au format .cfg." });
  }
  const hardwareModelId = parseId(req.body.hardwareModelId);
  if (hardwareModelId === null) {
    return res.status(400).json({ error: "Le modèle de passerelle est requis." });
  }
  const parser = await findMoxaParser(hardwareModelId);
  if (!parser) {
    return res.status(400).json({ error: "Modèle de passerelle non supporté." });
  }

  let parsed;
  try {
    parsed = parser(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Erreur de parsing : ${(err as Error).message}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO mgate_configurations
        (hardware_model_id, device_name, ip_address, subnet_mask, default_gateway, mac_address,
         modbus_tcp_port, max_tcp_sessions, snmp_enabled, read_community, raw_cfg, imported_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        hardwareModelId,
        parsed.deviceName,
        parsed.ipAddress,
        parsed.subnetMask,
        parsed.defaultGateway,
        parsed.macAddress,
        parsed.modbusTcpPort,
        parsed.maxTcpSessions,
        parsed.snmpEnabled,
        parsed.readCommunity,
        req.file.buffer,
        req.user!.id,
      ]
    );
    const configId = inserted.rows[0].id;

    for (const p of parsed.serialPorts) {
      const portInserted = await client.query(
        `INSERT INTO mgate_serial_ports
          (mgate_configuration_id, port_number, enabled, interface, baud_rate, data_bits, parity,
           stop_bits, flow_control, protocol, operation_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          configId,
          p.portNumber,
          p.enabled,
          p.interface,
          p.baudRate,
          p.dataBits,
          p.parity,
          p.stopBits,
          p.flowControl,
          p.protocol,
          p.operationMode,
        ]
      );
      const portId = portInserted.rows[0].id;

      for (const s of p.slaveIds) {
        await client.query(
          `INSERT INTO mgate_slave_ids
            (mgate_serial_port_id, slave_number_start, slave_number_end, modbus_id_start, modbus_id_end)
           VALUES ($1,$2,$3,$4,$5)`,
          [portId, s.slaveNumberStart, s.slaveNumberEnd, s.modbusIdStart, s.modbusIdEnd]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({
      id: configId,
      deviceName: parsed.deviceName,
      ipAddress: parsed.ipAddress,
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
  const result = await pool.query("DELETE FROM mgate_configurations WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }
  res.status(204).send();
});

router.get("/:id/cfg", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("SELECT device_name, raw_cfg FROM mgate_configurations WHERE id = $1", [id]);
  const config = result.rows[0];
  if (!config) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }
  if (!config.raw_cfg) {
    return res.status(404).json({ error: "Aucun fichier .cfg d'origine pour cette configuration." });
  }
  res.setHeader("Content-Disposition", `attachment; filename="${config.device_name || "mgate"}.cfg"`);
  res.type("application/octet-stream").send(config.raw_cfg);
});

export default router;
