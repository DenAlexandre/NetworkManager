import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("data-types"));

const linkTypeSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide."),
  strokeWidth: z.number().min(1, "L'épaisseur doit être au moins 1.").max(20, "Épaisseur trop grande (max 20)."),
  pointToPoint: z.boolean(),
});

const LINK_TYPE_SELECT = `SELECT id, name, color, stroke_width AS "strokeWidth", point_to_point AS "pointToPoint" FROM link_types`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${LINK_TYPE_SELECT} ORDER BY id`);
  res.json({ linkTypes: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${LINK_TYPE_SELECT} WHERE id = $1`, [id]);
  const linkType = result.rows[0];
  if (!linkType) {
    return res.status(404).json({ error: "Type de liaison introuvable." });
  }
  res.json({ linkType });
});

router.post("/", async (req, res) => {
  const parsed = linkTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, color, strokeWidth, pointToPoint } = parsed.data;

  const existing = await pool.query("SELECT id FROM link_types WHERE name = $1", [name]);
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce type de liaison existe déjà." });
  }

  const inserted = await pool.query(
    "INSERT INTO link_types (name, color, stroke_width, point_to_point) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, color, strokeWidth, pointToPoint]
  );
  const result = await pool.query(`${LINK_TYPE_SELECT} WHERE id = $1`, [inserted.rows[0].id]);
  res.status(201).json({ linkType: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = linkTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, color, strokeWidth, pointToPoint } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM link_types WHERE name = $1 AND id != $2",
    [name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce type de liaison existe déjà." });
  }

  const updated = await pool.query(
    "UPDATE link_types SET name = $1, color = $2, stroke_width = $3, point_to_point = $4 WHERE id = $5 RETURNING id",
    [name, color, strokeWidth, pointToPoint, id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "Type de liaison introuvable." });
  }
  const result = await pool.query(`${LINK_TYPE_SELECT} WHERE id = $1`, [id]);
  res.json({ linkType: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const result = await pool.query("DELETE FROM link_types WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Type de liaison introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce type de liaison est utilisé par des entrées/sorties et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
