import fs from "fs";
import path from "path";
import { Response, Router } from "express";
import multer from "multer";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("system"));

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const filesUpload = multer({ storage: multer.memoryStorage() });

// Gestion des droits (comptes + rôles/permissions) : sauvegardée/restaurée séparément de la
// sauvegarde "Données" ci-dessous via /database/backup-rights et /database/restore-rights.
// `roles` doit précéder `users` (FK `users.role_id`) et `role_permissions` (FK `role_id`).
const RIGHTS_TABLES = ["roles", "role_permissions", "users"];

// Order matters: parents before children, so restore can insert rows without violating
// foreign-key constraints. Matches the FK relationships in db/migrate.ts (note that although
// `equipment` is created before `apis` in the schema, `equipment.api_id` references `apis`,
// so `apis` must be restored first). Note that `switch_configurations.imported_by_id` and
// `mgate_configurations.imported_by_id` reference `users(id)` — restoring this list onto a
// database whose `users` don't have matching ids yet (e.g. before a Gestion des droits restore)
// will fail; restore Gestion des droits first when rebuilding from scratch.
const DATA_TABLES = [
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
// Gestion des droits (users/roles/role_permissions) survit à la réinitialisation au même titre
// que le catalogue — ce sont les comptes existants et leurs droits, pas des données d'instance.
const RESET_TABLES = DATA_TABLES.filter((t) => !CATALOG_TABLES.includes(t));

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

// Columns that reference another row of the SAME table (e.g. equipment.linked_equipment_id).
// Rows come back from `SELECT *` in id order, so a row can reference another row with a higher
// id that hasn't been inserted yet — inserting straight through would violate the FK. Instead
// insert with the column nulled out, then fix it up in a second pass once every row exists.
const SELF_REFERENCING_COLUMNS: Record<string, string[]> = {
  equipment: ["linked_equipment_id"],
};

const restoreSchema = z.object({
  version: z.number(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))),
});

async function backupTables(tableList: string[]) {
  const tables: Record<string, unknown[]> = {};
  for (const table of tableList) {
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
  return { version: 1, createdAt: new Date().toISOString(), tables };
}

function sendBackup(res: Response, payload: unknown, filenamePrefix: string) {
  const filename = `${filenamePrefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
}

async function restoreTables(tableList: string[], tables: Record<string, Record<string, unknown>[]>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${tableList.join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of tableList) {
      const rows = tables[table] ?? [];
      const jsonColumns = JSON_COLUMNS[table] ?? [];
      const binaryColumns = BINARY_COLUMNS[table] ?? [];
      const selfReferencingColumns = SELF_REFERENCING_COLUMNS[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const values = columns.map((c) => {
          if (selfReferencingColumns.includes(c)) return null;
          if (jsonColumns.includes(c)) return JSON.stringify(row[c]);
          if (binaryColumns.includes(c)) return row[c] == null ? null : Buffer.from(row[c] as string, "base64");
          return row[c];
        });
        const columnList = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(`INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`, values);
      }
      for (const column of selfReferencingColumns) {
        for (const row of rows) {
          if (row[column] != null) {
            await client.query(`UPDATE ${table} SET "${column}" = $1 WHERE id = $2`, [row[column], row.id]);
          }
        }
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
}

router.get("/database/backup", async (_req, res) => {
  sendBackup(res, await backupTables(DATA_TABLES), "backup-data");
});

router.post("/database/restore", async (req, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Fichier de sauvegarde invalide." });
  }
  await restoreTables(DATA_TABLES, parsed.data.tables);
  res.json({ success: true });
});

// Gestion des droits (Utilisateurs/Rôle/Droits) : sauvegarde/restauration séparées de la
// sauvegarde "Données" ci-dessus.
router.get("/database/backup-rights", async (_req, res) => {
  sendBackup(res, await backupTables(RIGHTS_TABLES), "backup-rights");
});

router.post("/database/restore-rights", async (req, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Fichier de sauvegarde invalide." });
  }
  await restoreTables(RIGHTS_TABLES, parsed.data.tables);
  res.json({ success: true });
});

// Fichiers uploadés (photos de matériel, fiches techniques matériel/sites) : sauvegarde/
// restauration séparées de la sauvegarde base de données ci-dessus, car ce sont des fichiers
// binaires servis depuis le disque (`uploads/`), pas des lignes de table. Zippe/dézippe le
// dossier `uploads/` tel quel, donc couvre aussi tout futur type de fichier uploadé sans
// modification ici.
router.get("/database/backup-files", async (_req, res) => {
  const filename = `backup-files-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: Error) => {
    throw err;
  });
  archive.pipe(res);
  if (fs.existsSync(UPLOADS_DIR)) {
    archive.directory(UPLOADS_DIR, false);
  }
  await archive.finalize();
});

router.post("/database/restore-files", filesUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier reçu." });
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Fichier de sauvegarde invalide (zip attendu)." });
  }

  // Full replace, matching /database/restore's TRUNCATE-then-insert semantics: clear the
  // existing uploads before extracting so the result exactly matches the backup's contents.
  // UPLOADS_DIR itself is a Docker volume mount point in the compose deployment, so only its
  // contents can be removed (rmdir-ing the mount point itself fails with EBUSY).
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  for (const entry of fs.readdirSync(UPLOADS_DIR)) {
    fs.rmSync(path.join(UPLOADS_DIR, entry), { recursive: true, force: true });
  }
  zip.extractAllTo(UPLOADS_DIR, true);

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
