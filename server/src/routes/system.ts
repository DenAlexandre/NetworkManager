import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("system"));

// Order matters: parents before children, so restore can insert rows without violating
// foreign-key constraints. Matches the FK relationships in db/migrate.ts (note that although
// `equipment` is created before `apis` in the schema, `equipment.api_id` references `apis`,
// so `apis` must be restored first). `roles` must precede `users` since `users.role_id`
// references it.
const TABLES = [
  "roles",
  "role_permissions",
  "users",
  "device_types",
  "brands",
  "link_types",
  "configuration_types",
  "hardware_models",
  "hardware_model_ports",
  "hardware_model_variables",
  "hardware_model_port_aliases",
  "sites",
  "zones",
  "rooms",
  "apis",
  "equipment",
  "equipment_links",
  "equipment_port_settings",
  "equipment_variable_settings",
  "design_schemas",
  "switch_configurations",
  "switch_vlans",
  "switch_ports",
  "switch_mrp_configs",
  "mgate_configurations",
  "mgate_serial_ports",
  "mgate_slave_ids",
  "report_configs",
];

// Le catalogue "Type des données" (Type des données > Marques/Types de matériel/Matériel/Liaisons) :
// conservé tel quel par la réinitialisation, seules les autres tables sont vidées.
// hardware_model_variables et hardware_model_port_aliases sont des attributs du modèle matériel
// au même titre que hardware_model_ports, donc traités comme faisant partie de ce catalogue.
const CATALOG_TABLES = [
  "device_types",
  "brands",
  "link_types",
  "configuration_types",
  "hardware_models",
  "hardware_model_ports",
  "hardware_model_variables",
  "hardware_model_port_aliases",
];
// roles/role_permissions define access for the accounts the reset keeps, so they must survive
// it too — truncating `roles` with CASCADE would otherwise also wipe `users` (FK `role_id`).
const RESET_TABLES = TABLES.filter(
  (t) => t !== "users" && t !== "roles" && t !== "role_permissions" && !CATALOG_TABLES.includes(t)
);

// Columns that hold JSONB data and must be re-stringified before being sent back as an
// INSERT parameter (node-postgres returns them already parsed as JS objects from SELECT).
const JSON_COLUMNS: Record<string, string[]> = {
  design_schemas: ["layout"],
  report_configs: ["column_ids", "filters"],
};

// BYTEA columns (raw binary): node-postgres returns them as Buffers, but Buffer has a toJSON()
// that JSON.stringify silently turns into {type:"Buffer",data:[...]} — parsing that back and
// handing the plain object to pg as an insert parameter does NOT reconstruct a Buffer, so the
// restored bytea would be corrupted. Base64-encode to a plain string for the backup file, and
// decode back to a Buffer on restore.
const BINARY_COLUMNS: Record<string, string[]> = {
  mgate_configurations: ["raw_cfg"],
};

const restoreSchema = z.object({
  version: z.number(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))),
});

router.get("/database/backup", async (_req, res) => {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const result = await pool.query(`SELECT * FROM ${table}`);
    const binaryColumns = BINARY_COLUMNS[table] ?? [];
    tables[table] = binaryColumns.length
      ? result.rows.map((row) => {
          const copy = { ...row };
          for (const col of binaryColumns) {
            if (copy[col] != null) copy[col] = (copy[col] as Buffer).toString("base64");
          }
          return copy;
        })
      : result.rows;
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
      const binaryColumns = BINARY_COLUMNS[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const values = columns.map((c) => {
          if (jsonColumns.includes(c)) return JSON.stringify(row[c]);
          if (binaryColumns.includes(c)) return row[c] == null ? null : Buffer.from(row[c] as string, "base64");
          return row[c];
        });
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

// Réinitialisation (RAZ) : vide toutes les données de l'application à l'exception des comptes
// utilisateurs, des rôles/permissions (Gestion des droits) et du catalogue "Type des données"
// (device_types, brands, link_types, hardware_models, hardware_model_ports), qui restent intacts.
router.post("/database/reset", async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${RESET_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
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
