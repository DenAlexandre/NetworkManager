import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const reportConfigSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  columnIds: z.array(z.string()),
  filters: z.record(z.string(), z.array(z.string())),
  sortColumnId: z.string().nullable().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  onlyLinked: z.boolean().optional(),
});

const REPORT_CONFIG_SELECT = `
  SELECT id, name, column_ids AS "columnIds", filters,
         sort_column_id AS "sortColumnId", sort_dir AS "sortDir", only_linked AS "onlyLinked",
         updated_at AS "updatedAt"
  FROM report_configs
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function uniqueNameError(err: unknown) {
  return (err as { code?: string; constraint?: string }).code === "23505";
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${REPORT_CONFIG_SELECT} ORDER BY name`);
  res.json({ configs: result.rows });
});

router.post("/", async (req, res) => {
  const parsed = reportConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, columnIds, filters, sortColumnId, sortDir, onlyLinked } = parsed.data;
  try {
    const inserted = await pool.query(
      `INSERT INTO report_configs (name, column_ids, filters, sort_column_id, sort_dir, only_linked)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, JSON.stringify(columnIds), JSON.stringify(filters), sortColumnId ?? null, sortDir ?? "asc", onlyLinked ?? false]
    );
    const result = await pool.query(`${REPORT_CONFIG_SELECT} WHERE id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ config: result.rows[0] });
  } catch (err) {
    if (uniqueNameError(err)) {
      return res.status(409).json({ error: "Une configuration porte déjà ce nom." });
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = reportConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, columnIds, filters, sortColumnId, sortDir, onlyLinked } = parsed.data;
  try {
    const updated = await pool.query(
      `UPDATE report_configs
       SET name = $1, column_ids = $2, filters = $3, sort_column_id = $4, sort_dir = $5, only_linked = $6, updated_at = now()
       WHERE id = $7
       RETURNING id`,
      [name, JSON.stringify(columnIds), JSON.stringify(filters), sortColumnId ?? null, sortDir ?? "asc", onlyLinked ?? false, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Configuration introuvable." });
    }
  } catch (err) {
    if (uniqueNameError(err)) {
      return res.status(409).json({ error: "Une configuration porte déjà ce nom." });
    }
    throw err;
  }
  const result = await pool.query(`${REPORT_CONFIG_SELECT} WHERE id = $1`, [id]);
  res.json({ config: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM report_configs WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Configuration introuvable." });
  }
  res.status(204).send();
});

export default router;
