import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

// Order matters: parents before children, so restore can insert rows without violating
// foreign-key constraints. Matches the FK relationships in db/migrate.ts (note that although
// `equipment` is created before `apis` in the schema, `equipment.api_id` references `apis`,
// so `apis` must be restored first).
const TABLES = [
  "users",
  "device_types",
  "brands",
  "link_types",
  "hardware_models",
  "hardware_model_ports",
  "sites",
  "zones",
  "rooms",
  "apis",
  "equipment",
  "equipment_links",
  "design_schemas",
];

// Columns that hold JSONB data and must be re-stringified before being sent back as an
// INSERT parameter (node-postgres returns them already parsed as JS objects from SELECT).
const JSON_COLUMNS: Record<string, string[]> = {
  design_schemas: ["layout"],
};

const restoreSchema = z.object({
  version: z.number(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))),
});

router.get("/database/backup", async (_req, res) => {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const result = await pool.query(`SELECT * FROM ${table}`);
    tables[table] = result.rows;
  }
  const payload = { version: 1, createdAt: new Date().toISOString(), tables };
  const filename = `networkmanager-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
});

router.post("/database/restore", async (req, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Fichier de sauvegarde invalide." });
  }
  const { tables } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of TABLES) {
      const rows = tables[table] ?? [];
      const jsonColumns = JSON_COLUMNS[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const values = columns.map((c) => (jsonColumns.includes(c) ? JSON.stringify(row[c]) : row[c]));
        const columnList = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(`INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`, values);
      }
      // Restored rows keep their original ids, so each table's serial sequence must be
      // pushed forward past the highest restored id to avoid future collisions.
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
        [table]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.json({ success: true });
});

export default router;
