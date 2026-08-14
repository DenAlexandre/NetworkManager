import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const hardwareModelSchema = z.object({
  brandId: z.number().int("Le constructeur est requis."),
  name: z.string().min(1, "Le nom est requis."),
});

const HARDWARE_MODEL_SELECT = `
  SELECT hm.id, hm.brand_id AS "brandId", b.name AS "brandName", hm.name
  FROM hardware_models hm
  JOIN brands b ON b.id = hm.brand_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${HARDWARE_MODEL_SELECT} ORDER BY hm.id`);
  res.json({ hardwareModels: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
  const hardwareModel = result.rows[0];
  if (!hardwareModel) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  res.json({ hardwareModel });
});

router.post("/", async (req, res) => {
  const parsed = hardwareModelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { brandId, name } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM hardware_models WHERE brand_id = $1 AND name = $2",
    [brandId, name]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce matériel existe déjà pour ce constructeur." });
  }

  try {
    const inserted = await pool.query(
      "INSERT INTO hardware_models (brand_id, name) VALUES ($1, $2) RETURNING id",
      [brandId, name]
    );
    const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ hardwareModel: result.rows[0] });
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
  const parsed = hardwareModelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { brandId, name } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM hardware_models WHERE brand_id = $1 AND name = $2 AND id != $3",
    [brandId, name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce matériel existe déjà pour ce constructeur." });
  }

  try {
    const updated = await pool.query(
      "UPDATE hardware_models SET brand_id = $1, name = $2 WHERE id = $3 RETURNING id",
      [brandId, name, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
    res.json({ hardwareModel: result.rows[0] });
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
  try {
    const result = await pool.query("DELETE FROM hardware_models WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce matériel est utilisé par du matériel de zone et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
