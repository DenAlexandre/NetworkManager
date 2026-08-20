import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("data-types"));

const deviceTypeSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
});

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT id, name FROM device_types ORDER BY id");
  res.json({ deviceTypes: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("SELECT id, name FROM device_types WHERE id = $1", [id]);
  const deviceType = result.rows[0];
  if (!deviceType) {
    return res.status(404).json({ error: "Type de matériel introuvable." });
  }
  res.json({ deviceType });
});

router.post("/", async (req, res) => {
  const parsed = deviceTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await pool.query("SELECT id FROM device_types WHERE name = $1", [parsed.data.name]);
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce type de matériel existe déjà." });
  }

  const result = await pool.query(
    "INSERT INTO device_types (name) VALUES ($1) RETURNING id, name",
    [parsed.data.name]
  );
  res.status(201).json({ deviceType: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = deviceTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await pool.query(
    "SELECT id FROM device_types WHERE name = $1 AND id != $2",
    [parsed.data.name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce type de matériel existe déjà." });
  }

  const result = await pool.query(
    "UPDATE device_types SET name = $1 WHERE id = $2 RETURNING id, name",
    [parsed.data.name, id]
  );
  const updated = result.rows[0];
  if (!updated) {
    return res.status(404).json({ error: "Type de matériel introuvable." });
  }
  res.json({ deviceType: updated });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const result = await pool.query("DELETE FROM device_types WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Type de matériel introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce type de matériel est utilisé par du matériel de zone et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

const replaceSchema = z.object({
  replacementId: z.number().int("Le type de remplacement est requis."),
});

// Reassigns every hardware model and equipment record pointing at :id to replacementId, then
// deletes :id — lets the client offer "replace instead of delete" when the 409 above fires.
router.post("/:id/replace", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = replaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { replacementId } = parsed.data;
  if (replacementId === id) {
    return res.status(400).json({ error: "Choisissez un type de matériel différent." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const replacement = await client.query("SELECT id FROM device_types WHERE id = $1", [replacementId]);
    if (!replacement.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Type de remplacement introuvable." });
    }

    await client.query("UPDATE hardware_models SET device_type_id = $1 WHERE device_type_id = $2", [
      replacementId,
      id,
    ]);
    await client.query("UPDATE equipment SET device_type_id = $1 WHERE device_type_id = $2", [replacementId, id]);

    const deleted = await client.query("DELETE FROM device_types WHERE id = $1", [id]);
    if (!deleted.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Type de matériel introuvable." });
    }

    await client.query("COMMIT");
    res.status(204).send();
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export default router;
