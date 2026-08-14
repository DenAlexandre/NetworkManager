import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const manufacturerSchema = z.object({
  deviceTypeId: z.number().int("Le type de matériel est requis."),
  brandId: z.number().int("Le constructeur est requis."),
  hardwareModelId: z.number().int().optional().nullable(),
  docPath: optionalText,
  ioType: optionalText,
});

const MANUFACTURER_SELECT = `
  SELECT m.id, m.device_type_id AS "deviceTypeId", dt.name AS "deviceType",
         m.brand_id AS "brandId", b.name AS "manufacturer",
         m.hardware_model_id AS "hardwareModelId", hm.name AS "reference",
         m.doc_path AS "docPath", m.io_type AS "ioType"
  FROM manufacturers m
  JOIN device_types dt ON dt.id = m.device_type_id
  JOIN brands b ON b.id = m.brand_id
  LEFT JOIN hardware_models hm ON hm.id = m.hardware_model_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function fkErrorMessage(err: unknown) {
  const constraint = (err as { constraint?: string }).constraint || "";
  if (constraint.includes("hardware_model")) {
    return "Matériel introuvable.";
  }
  if (constraint.includes("brand")) {
    return "Constructeur introuvable.";
  }
  return "Type de matériel introuvable.";
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${MANUFACTURER_SELECT} ORDER BY m.id`);
  res.json({ manufacturers: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${MANUFACTURER_SELECT} WHERE m.id = $1`, [id]);
  const manufacturer = result.rows[0];
  if (!manufacturer) {
    return res.status(404).json({ error: "Constructeur introuvable." });
  }
  res.json({ manufacturer });
});

router.post("/", async (req, res) => {
  const parsed = manufacturerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { deviceTypeId, brandId, hardwareModelId, docPath, ioType } = parsed.data;

  try {
    const inserted = await pool.query(
      `INSERT INTO manufacturers (device_type_id, brand_id, hardware_model_id, doc_path, io_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [deviceTypeId, brandId, hardwareModelId ?? null, docPath, ioType]
    );
    const result = await pool.query(`${MANUFACTURER_SELECT} WHERE m.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ manufacturer: result.rows[0] });
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
  const parsed = manufacturerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { deviceTypeId, brandId, hardwareModelId, docPath, ioType } = parsed.data;

  try {
    const updated = await pool.query(
      `UPDATE manufacturers
       SET device_type_id = $1, brand_id = $2, hardware_model_id = $3, doc_path = $4, io_type = $5
       WHERE id = $6
       RETURNING id`,
      [deviceTypeId, brandId, hardwareModelId ?? null, docPath, ioType, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Constructeur introuvable." });
    }
    const result = await pool.query(`${MANUFACTURER_SELECT} WHERE m.id = $1`, [id]);
    res.json({ manufacturer: result.rows[0] });
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
  try {
    const result = await pool.query("DELETE FROM manufacturers WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Constructeur introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce constructeur est utilisé par du matériel ou des entrées/sorties et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
