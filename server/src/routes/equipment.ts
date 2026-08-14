import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const equipmentSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  manufacturerId: z.number().int("Le constructeur est requis."),
});

const EQUIPMENT_SELECT = `
  SELECT e.id, e.name, e.manufacturer_id AS "manufacturerId",
         b.name AS "manufacturerName", dt.name AS "deviceType"
  FROM network_equipment e
  JOIN manufacturers m ON m.id = e.manufacturer_id
  JOIN device_types dt ON dt.id = m.device_type_id
  JOIN brands b ON b.id = m.brand_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
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
  const { name, manufacturerId } = parsed.data;

  try {
    const inserted = await pool.query(
      `INSERT INTO network_equipment (name, manufacturer_id) VALUES ($1, $2) RETURNING id`,
      [name, manufacturerId]
    );
    const result = await pool.query(`${EQUIPMENT_SELECT} WHERE e.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ equipment: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Constructeur introuvable." });
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
  const { name, manufacturerId } = parsed.data;

  try {
    const updated = await pool.query(
      `UPDATE network_equipment SET name = $1, manufacturer_id = $2 WHERE id = $3 RETURNING id`,
      [name, manufacturerId, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    const result = await pool.query(`${EQUIPMENT_SELECT} WHERE e.id = $1`, [id]);
    res.json({ equipment: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Constructeur introuvable." });
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM network_equipment WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  res.status(204).send();
});

export default router;
