import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const apiSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  migrationDate: z.string().nullable().optional(),
  completed: z.boolean(),
  doeUpToDate: z.boolean(),
});

const API_SELECT = `
  SELECT id, name, migration_date AS "migrationDate", completed, doe_up_to_date AS "doeUpToDate"
  FROM apis
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${API_SELECT} ORDER BY id`);
  res.json({ apis: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${API_SELECT} WHERE id = $1`, [id]);
  const api = result.rows[0];
  if (!api) {
    return res.status(404).json({ error: "API introuvable." });
  }
  res.json({ api });
});

router.post("/", async (req, res) => {
  const parsed = apiSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, migrationDate, completed, doeUpToDate } = parsed.data;

  const inserted = await pool.query(
    `INSERT INTO apis (name, migration_date, completed, doe_up_to_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, migrationDate || null, completed, doeUpToDate]
  );
  const result = await pool.query(`${API_SELECT} WHERE id = $1`, [inserted.rows[0].id]);
  res.status(201).json({ api: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = apiSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, migrationDate, completed, doeUpToDate } = parsed.data;

  const updated = await pool.query(
    `UPDATE apis SET name = $1, migration_date = $2, completed = $3, doe_up_to_date = $4 WHERE id = $5 RETURNING id`,
    [name, migrationDate || null, completed, doeUpToDate, id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "API introuvable." });
  }
  const result = await pool.query(`${API_SELECT} WHERE id = $1`, [id]);
  res.json({ api: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM apis WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "API introuvable." });
  }
  res.status(204).send();
});

export default router;
