import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const siteSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
});

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT id, name FROM sites ORDER BY id");
  res.json({ sites: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("SELECT id, name FROM sites WHERE id = $1", [id]);
  const site = result.rows[0];
  if (!site) {
    return res.status(404).json({ error: "Site introuvable." });
  }
  res.json({ site });
});

router.post("/", async (req, res) => {
  const parsed = siteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await pool.query("SELECT id FROM sites WHERE name = $1", [parsed.data.name]);
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce site existe déjà." });
  }

  const result = await pool.query(
    "INSERT INTO sites (name) VALUES ($1) RETURNING id, name",
    [parsed.data.name]
  );
  res.status(201).json({ site: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = siteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await pool.query(
    "SELECT id FROM sites WHERE name = $1 AND id != $2",
    [parsed.data.name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce site existe déjà." });
  }

  const result = await pool.query(
    "UPDATE sites SET name = $1 WHERE id = $2 RETURNING id, name",
    [parsed.data.name, id]
  );
  const updated = result.rows[0];
  if (!updated) {
    return res.status(404).json({ error: "Site introuvable." });
  }
  res.json({ site: updated });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const result = await pool.query("DELETE FROM sites WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Site introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce site contient des zones et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
