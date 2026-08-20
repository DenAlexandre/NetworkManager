import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const settingSchema = z.object({
  equipmentId: z.number().int("Le matériel est requis."),
  hardwareModelVariableId: z.number().int("La variable est requise."),
  mnemonic: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const VARIABLE_SETTING_SELECT = `
  SELECT e.id AS "equipmentId", e.name AS "equipmentName",
         dt.name AS "deviceType", hm.name AS "hardwareModel", b.name AS "brandName",
         e.room_id AS "roomId", s.name AS "siteName", z.name AS "zoneName", r.name AS "roomName",
         e.api_id AS "apiId", a.name AS "apiName",
         v.id AS "hardwareModelVariableId", v.name, v.unit, v.register,
         COALESCE(st.mnemonic, '') AS mnemonic, COALESCE(st.description, '') AS description
  FROM equipment e
  JOIN rooms r ON r.id = e.room_id
  JOIN zones z ON z.id = r.zone_id
  JOIN sites s ON s.id = z.site_id
  JOIN device_types dt ON dt.id = e.device_type_id
  JOIN hardware_models hm ON hm.id = e.hardware_model_id
  JOIN brands b ON b.id = hm.brand_id
  LEFT JOIN apis a ON a.id = e.api_id
  JOIN hardware_model_variables v ON v.hardware_model_id = e.hardware_model_id
  LEFT JOIN equipment_variable_settings st ON st.hardware_model_variable_id = v.id AND st.equipment_id = e.id
`;

router.get("/", async (req, res) => {
  const equipmentId = req.query.equipmentId ? Number(req.query.equipmentId) : null;
  const result = equipmentId
    ? await pool.query(`${VARIABLE_SETTING_SELECT} WHERE e.id = $1 ORDER BY e.id, v.id`, [equipmentId])
    : await pool.query(`${VARIABLE_SETTING_SELECT} ORDER BY e.id, v.id`);

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
      variables: unknown[];
    }
  >();

  for (const row of result.rows) {
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
        variables: [],
      };
      equipmentMap.set(row.equipmentId, entry);
    }
    entry.variables.push({
      hardwareModelVariableId: row.hardwareModelVariableId,
      name: row.name,
      unit: row.unit,
      register: row.register,
      mnemonic: row.mnemonic,
      description: row.description,
    });
  }

  res.json({ equipment: [...equipmentMap.values()] });
});

router.put("/", async (req, res) => {
  const parsed = settingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { equipmentId, hardwareModelVariableId, mnemonic, description } = parsed.data;

  try {
    await pool.query(
      `INSERT INTO equipment_variable_settings (equipment_id, hardware_model_variable_id, mnemonic, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (equipment_id, hardware_model_variable_id)
       DO UPDATE SET mnemonic = $3, description = $4`,
      [equipmentId, hardwareModelVariableId, mnemonic ?? "", description ?? ""]
    );
    const result = await pool.query(`${VARIABLE_SETTING_SELECT} WHERE e.id = $1 AND v.id = $2`, [
      equipmentId,
      hardwareModelVariableId,
    ]);
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Variable introuvable pour ce matériel." });
    }
    res.json({
      variable: {
        hardwareModelVariableId: row.hardwareModelVariableId,
        name: row.name,
        unit: row.unit,
        register: row.register,
        mnemonic: row.mnemonic,
        description: row.description,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Matériel ou variable introuvable." });
    }
    throw err;
  }
});

export default router;
