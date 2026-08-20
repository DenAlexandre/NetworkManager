import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("data-types"));

const variableSchema = z.object({
  hardwareModelId: z.number().int("Le matériel est requis."),
  name: z.string().min(1, "Le nom de la variable est requis."),
  unit: z.string().optional().default(""),
  register: z.string().optional().default(""),
});

const VARIABLE_SELECT = `
  SELECT v.id, v.hardware_model_id AS "hardwareModelId", v.name, v.unit, v.register,
         hm.name AS "hardwareModelName", b.name AS "brandName"
  FROM hardware_model_variables v
  JOIN hardware_models hm ON hm.id = v.hardware_model_id
  JOIN brands b ON b.id = hm.brand_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${VARIABLE_SELECT} ORDER BY v.id`);
  res.json({ variables: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${VARIABLE_SELECT} WHERE v.id = $1`, [id]);
  const variable = result.rows[0];
  if (!variable) {
    return res.status(404).json({ error: "Variable introuvable." });
  }
  res.json({ variable });
});

router.post("/", async (req, res) => {
  const parsed = variableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { hardwareModelId, name, unit, register } = parsed.data;

  try {
    const inserted = await pool.query(
      `INSERT INTO hardware_model_variables (hardware_model_id, name, unit, register) VALUES ($1, $2, $3, $4) RETURNING id`,
      [hardwareModelId, name, unit, register]
    );
    const result = await pool.query(`${VARIABLE_SELECT} WHERE v.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ variable: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Matériel introuvable." });
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = variableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { hardwareModelId, name, unit, register } = parsed.data;

  try {
    const updated = await pool.query(
      `UPDATE hardware_model_variables SET hardware_model_id = $1, name = $2, unit = $3, register = $4 WHERE id = $5 RETURNING id`,
      [hardwareModelId, name, unit, register, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Variable introuvable." });
    }
    const result = await pool.query(`${VARIABLE_SELECT} WHERE v.id = $1`, [id]);
    res.json({ variable: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Matériel introuvable." });
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM hardware_model_variables WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Variable introuvable." });
  }
  res.status(204).send();
});

export default router;
