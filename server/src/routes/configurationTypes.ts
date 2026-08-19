import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const configurationTypeSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  configuration: z.string().optional().default(""),
});

const CONFIGURATION_TYPE_SELECT = `SELECT id, name, configuration FROM configuration_types`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${CONFIGURATION_TYPE_SELECT} ORDER BY id`);
  res.json({ configurationTypes: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${CONFIGURATION_TYPE_SELECT} WHERE id = $1`, [id]);
  const configurationType = result.rows[0];
  if (!configurationType) {
    return res.status(404).json({ error: "Type de configuration introuvable." });
  }
  res.json({ configurationType });
});

router.post("/", async (req, res) => {
  const parsed = configurationTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, configuration } = parsed.data;

  const existing = await pool.query("SELECT id FROM configuration_types WHERE name = $1", [name]);
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce type de configuration existe déjà." });
  }

  const inserted = await pool.query(
    "INSERT INTO configuration_types (name, configuration) VALUES ($1, $2) RETURNING id",
    [name, configuration]
  );
  const result = await pool.query(`${CONFIGURATION_TYPE_SELECT} WHERE id = $1`, [inserted.rows[0].id]);
  res.status(201).json({ configurationType: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = configurationTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, configuration } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM configuration_types WHERE name = $1 AND id != $2",
    [name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce type de configuration existe déjà." });
  }

  const updated = await pool.query(
    "UPDATE configuration_types SET name = $1, configuration = $2 WHERE id = $3 RETURNING id",
    [name, configuration, id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "Type de configuration introuvable." });
  }
  const result = await pool.query(`${CONFIGURATION_TYPE_SELECT} WHERE id = $1`, [id]);
  res.json({ configurationType: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const result = await pool.query("DELETE FROM configuration_types WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Type de configuration introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce type de configuration est utilisé par des ports et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
