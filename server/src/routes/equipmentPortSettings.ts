import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const settingSchema = z.object({
  equipmentId: z.number().int("Le matériel est requis."),
  hardwareModelPortId: z.number().int("Le port est requis."),
  modbusAddress: z.string().nullable().optional(),
  vlan: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  gateway: z.string().nullable().optional(),
  subnetMask: z.string().nullable().optional(),
});

const ADDRESSING_SELECT = `
  SELECT e.id AS "equipmentId", e.name AS "equipmentName",
         dt.name AS "deviceType", hm.name AS "hardwareModel", b.name AS "brandName",
         e.room_id AS "roomId", s.name AS "siteName", z.name AS "zoneName", r.name AS "roomName",
         e.api_id AS "apiId", a.name AS "apiName",
         p.id AS "hardwareModelPortId", p.label, lt.name AS "portType",
         st.modbus_address AS "modbusAddress", st.vlan,
         st.ip_address AS "ipAddress", st.gateway, st.subnet_mask AS "subnetMask"
  FROM equipment e
  JOIN rooms r ON r.id = e.room_id
  JOIN zones z ON z.id = r.zone_id
  JOIN sites s ON s.id = z.site_id
  JOIN device_types dt ON dt.id = e.device_type_id
  JOIN hardware_models hm ON hm.id = e.hardware_model_id
  JOIN brands b ON b.id = hm.brand_id
  LEFT JOIN apis a ON a.id = e.api_id
  JOIN hardware_model_ports p ON p.hardware_model_id = e.hardware_model_id
  JOIN link_types lt ON lt.id = p.link_type_id
  LEFT JOIN equipment_port_settings st ON st.hardware_model_port_id = p.id AND st.equipment_id = e.id
`;

function normalizePortType(name: string) {
  return name.toLowerCase().replace(/[\s/]/g, "");
}

function isAddressablePortType(name: string) {
  const normalized = normalizePortType(name);
  return normalized.includes("modbus") || normalized.includes("tcpip");
}

function blank(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${ADDRESSING_SELECT} ORDER BY e.id, p.id`);

  const equipmentMap = new Map<
    number,
    {
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
      ports: unknown[];
    }
  >();

  for (const row of result.rows) {
    if (!isAddressablePortType(row.portType)) continue;
    let entry = equipmentMap.get(row.equipmentId);
    if (!entry) {
      entry = {
        equipmentId: row.equipmentId,
        equipmentName: row.equipmentName,
        deviceType: row.deviceType,
        hardwareModel: row.hardwareModel,
        brandName: row.brandName,
        roomId: row.roomId,
        siteName: row.siteName,
        zoneName: row.zoneName,
        roomName: row.roomName,
        apiId: row.apiId,
        apiName: row.apiName,
        ports: [],
      };
      equipmentMap.set(row.equipmentId, entry);
    }
    entry.ports.push({
      hardwareModelPortId: row.hardwareModelPortId,
      label: row.label,
      portType: row.portType,
      modbusAddress: row.modbusAddress,
      vlan: row.vlan,
      ipAddress: row.ipAddress,
      gateway: row.gateway,
      subnetMask: row.subnetMask,
    });
  }

  res.json({ equipment: [...equipmentMap.values()] });
});

router.put("/", async (req, res) => {
  const parsed = settingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { equipmentId, hardwareModelPortId, modbusAddress, vlan, ipAddress, gateway, subnetMask } = parsed.data;

  try {
    await pool.query(
      `INSERT INTO equipment_port_settings
         (equipment_id, hardware_model_port_id, modbus_address, vlan, ip_address, gateway, subnet_mask)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (equipment_id, hardware_model_port_id)
       DO UPDATE SET modbus_address = $3, vlan = $4, ip_address = $5, gateway = $6, subnet_mask = $7`,
      [equipmentId, hardwareModelPortId, blank(modbusAddress), blank(vlan), blank(ipAddress), blank(gateway), blank(subnetMask)]
    );
    const result = await pool.query(`${ADDRESSING_SELECT} WHERE e.id = $1 AND p.id = $2`, [
      equipmentId,
      hardwareModelPortId,
    ]);
    const row = result.rows[0];
    res.json({
      port: {
        hardwareModelPortId: row.hardwareModelPortId,
        label: row.label,
        portType: row.portType,
        modbusAddress: row.modbusAddress,
        vlan: row.vlan,
        ipAddress: row.ipAddress,
        gateway: row.gateway,
        subnetMask: row.subnetMask,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Matériel ou port introuvable." });
    }
    throw err;
  }
});

export default router;
