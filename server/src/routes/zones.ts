import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("sites"));

const zoneSchema = z.object({
  siteId: z.number().int("Le site est requis."),
  name: z.string().min(1, "Le nom est requis."),
});

const ZONE_SELECT = `
  SELECT z.id, z.site_id AS "siteId", s.name AS "siteName", z.name
  FROM zones z
  JOIN sites s ON s.id = z.site_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (req, res) => {
  const siteId = req.query.siteId ? Number(req.query.siteId) : null;
  if (siteId !== null) {
    const result = await pool.query(`${ZONE_SELECT} WHERE z.site_id = $1 ORDER BY z.id`, [siteId]);
    return res.json({ zones: result.rows });
  }
  const result = await pool.query(`${ZONE_SELECT} ORDER BY z.id`);
  res.json({ zones: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${ZONE_SELECT} WHERE z.id = $1`, [id]);
  const zone = result.rows[0];
  if (!zone) {
    return res.status(404).json({ error: "Zone introuvable." });
  }
  res.json({ zone });
});

router.post("/", async (req, res) => {
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { siteId, name } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM zones WHERE site_id = $1 AND name = $2",
    [siteId, name]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Cette zone existe déjà pour ce site." });
  }

  try {
    const inserted = await pool.query(
      "INSERT INTO zones (site_id, name) VALUES ($1, $2) RETURNING id",
      [siteId, name]
    );
    const result = await pool.query(`${ZONE_SELECT} WHERE z.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ zone: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Site introuvable." });
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { siteId, name } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM zones WHERE site_id = $1 AND name = $2 AND id != $3",
    [siteId, name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Cette zone existe déjà pour ce site." });
  }

  try {
    const updated = await pool.query(
      "UPDATE zones SET site_id = $1, name = $2 WHERE id = $3 RETURNING id",
      [siteId, name, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Zone introuvable." });
    }
    const result = await pool.query(`${ZONE_SELECT} WHERE z.id = $1`, [id]);
    res.json({ zone: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Site introuvable." });
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
    const result = await pool.query("DELETE FROM zones WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Zone introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Cette zone contient des salles et ne peut pas être supprimée.",
      });
    }
    throw err;
  }
});

export default router;
