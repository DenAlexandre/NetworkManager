import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("equipment"));

const equipmentSchema = z.object({
  roomId: z.number().int("La salle est requise."),
  deviceTypeId: z.number().int("Le type de matériel est requis."),
  hardwareModelId: z.number().int("Le matériel est requis."),
  apiId: z.number().int().nullable().optional(),
  name: z.string().min(1, "Le nom est requis."),
  isApiStartPoint: z.boolean().optional(),
  linkedEquipmentId: z.number().int().nullable().optional(),
});

const EQUIPMENT_SELECT = `
  SELECT e.id, e.name,
         e.room_id AS "roomId", r.name AS "roomName",
         r.zone_id AS "zoneId", z.name AS "zoneName", z.site_id AS "siteId", s.name AS "siteName",
         e.device_type_id AS "deviceTypeId", dt.name AS "deviceType",
         e.hardware_model_id AS "hardwareModelId", hm.name AS "hardwareModel", b.name AS "brandName",
         hm.image_path AS "hardwareModelImagePath",
         e.api_id AS "apiId", a.name AS "apiName",
         e.is_api_start_point AS "isApiStartPoint",
         e.linked_equipment_id AS "linkedEquipmentId", le.name AS "linkedEquipmentName"
  FROM equipment e
  JOIN rooms r ON r.id = e.room_id
  JOIN zones z ON z.id = r.zone_id
  JOIN sites s ON s.id = z.site_id
  JOIN device_types dt ON dt.id = e.device_type_id
  JOIN hardware_models hm ON hm.id = e.hardware_model_id
  JOIN brands b ON b.id = hm.brand_id
  LEFT JOIN apis a ON a.id = e.api_id
  LEFT JOIN equipment le ON le.id = e.linked_equipment_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function fkErrorMessage(err: unknown) {
  const constraint = (err as { constraint?: string }).constraint || "";
  if (constraint.includes("device_type")) {
    return "Type de matériel introuvable.";
  }
  if (constraint.includes("hardware_model")) {
    return "Matériel introuvable.";
  }
  if (constraint.includes("linked_equipment")) {
    return "Matériel lié introuvable.";
  }
  if (constraint.includes("api")) {
    return "API introuvable.";
  }
  return "Salle introuvable.";
}

// linkedEquipmentId must point at another equipment sharing the same API — enforced here rather
// than in the schema/DB since it depends on the sibling apiId in the same payload.
async function validateLinkedEquipment(
  selfId: number | null,
  apiId: number | null | undefined,
  linkedEquipmentId: number | null | undefined
): Promise<string | null> {
  if (!linkedEquipmentId) return null;
  if (selfId !== null && linkedEquipmentId === selfId) {
    return "Le matériel ne peut pas être lié à lui-même.";
  }
  const result = await pool.query("SELECT api_id FROM equipment WHERE id = $1", [linkedEquipmentId]);
  const linked = result.rows[0];
  if (!linked) {
    return "Matériel lié introuvable.";
  }
  if (!apiId || linked.api_id !== apiId) {
    return "Le matériel lié doit appartenir à la même API.";
  }
  return null;
}

router.get("/", async (req, res) => {
  const roomId = req.query.roomId ? Number(req.query.roomId) : null;
  if (roomId !== null) {
    const result = await pool.query(`${EQUIPMENT_SELECT} WHERE e.room_id = $1 ORDER BY e.id`, [roomId]);
    return res.json({ equipment: result.rows });
  }
  const result = await pool.query(`${EQUIPMENT_SELECT} ORDER BY e.id`);
  res.json({ equipment: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${EQUIPMENT_SELECT} WHERE e.id = $1`, [id]);
  const item = result.rows[0];
  if (!item) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  res.json({ equipment: item });
});

router.post("/", async (req, res) => {
  const parsed = equipmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { roomId, deviceTypeId, hardwareModelId, apiId, name, isApiStartPoint, linkedEquipmentId } = parsed.data;

  const linkError = await validateLinkedEquipment(null, apiId, linkedEquipmentId);
  if (linkError) {
    return res.status(400).json({ error: linkError });
  }

  try {
    const inserted = await pool.query(
      `INSERT INTO equipment (room_id, device_type_id, hardware_model_id, api_id, name, is_api_start_point, linked_equipment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [roomId, deviceTypeId, hardwareModelId, apiId ?? null, name, isApiStartPoint ?? false, linkedEquipmentId ?? null]
    );
    const result = await pool.query(`${EQUIPMENT_SELECT} WHERE e.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ equipment: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: fkErrorMessage(err) });
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = equipmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { roomId, deviceTypeId, hardwareModelId, apiId, name, isApiStartPoint, linkedEquipmentId } = parsed.data;

  const linkError = await validateLinkedEquipment(id, apiId, linkedEquipmentId);
  if (linkError) {
    return res.status(400).json({ error: linkError });
  }

  try {
    const updated = await pool.query(
      `UPDATE equipment
       SET room_id = $1, device_type_id = $2, hardware_model_id = $3, api_id = $4, name = $5, is_api_start_point = $6,
           linked_equipment_id = $7
       WHERE id = $8
       RETURNING id`,
      [roomId, deviceTypeId, hardwareModelId, apiId ?? null, name, isApiStartPoint ?? false, linkedEquipmentId ?? null, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    const result = await pool.query(`${EQUIPMENT_SELECT} WHERE e.id = $1`, [id]);
    res.json({ equipment: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: fkErrorMessage(err) });
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM equipment WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  res.status(204).send();
});

export default router;
