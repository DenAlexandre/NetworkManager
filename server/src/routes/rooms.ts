import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("sites"));

const roomSchema = z.object({
  zoneId: z.number().int("La zone est requise."),
  name: z.string().min(1, "Le nom est requis."),
});

const ROOM_SELECT = `
  SELECT r.id, r.zone_id AS "zoneId", z.name AS "zoneName",
         z.site_id AS "siteId", s.name AS "siteName", r.name
  FROM rooms r
  JOIN zones z ON z.id = r.zone_id
  JOIN sites s ON s.id = z.site_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (req, res) => {
  const zoneId = req.query.zoneId ? Number(req.query.zoneId) : null;
  if (zoneId !== null) {
    const result = await pool.query(`${ROOM_SELECT} WHERE r.zone_id = $1 ORDER BY r.id`, [zoneId]);
    return res.json({ rooms: result.rows });
  }
  const result = await pool.query(`${ROOM_SELECT} ORDER BY r.id`);
  res.json({ rooms: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [id]);
  const room = result.rows[0];
  if (!room) {
    return res.status(404).json({ error: "Salle introuvable." });
  }
  res.json({ room });
});

router.post("/", async (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { zoneId, name } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM rooms WHERE zone_id = $1 AND name = $2",
    [zoneId, name]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Cette salle existe déjà pour cette zone." });
  }

  try {
    const inserted = await pool.query(
      "INSERT INTO rooms (zone_id, name) VALUES ($1, $2) RETURNING id",
      [zoneId, name]
    );
    const result = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ room: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Zone introuvable." });
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { zoneId, name } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM rooms WHERE zone_id = $1 AND name = $2 AND id != $3",
    [zoneId, name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Cette salle existe déjà pour cette zone." });
  }

  try {
    const updated = await pool.query(
      "UPDATE rooms SET zone_id = $1, name = $2 WHERE id = $3 RETURNING id",
      [zoneId, name, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Salle introuvable." });
    }
    const result = await pool.query(`${ROOM_SELECT} WHERE r.id = $1`, [id]);
    res.json({ room: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "Zone introuvable." });
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
    const result = await pool.query("DELETE FROM rooms WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Salle introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Cette salle contient du matériel et ne peut pas être supprimée.",
      });
    }
    throw err;
  }
});

export default router;
