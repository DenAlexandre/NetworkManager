import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";
import { uploadStorage } from "../services/uploadStorage";

const router = Router();
router.use(requireAuth, requirePermission("sites"));

const siteSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
});

const SITE_SELECT = `SELECT id, name, datasheet_path AS "datasheetPath" FROM sites`;

const DATASHEET_DIR = "site-datasheets";
const DATASHEET_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
};

const datasheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!DATASHEET_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error("Format de fichier non supporté (PDF uniquement)."));
      return;
    }
    cb(null, true);
  },
});

function deleteDatasheetFile(datasheetPath: string | null | undefined) {
  if (!datasheetPath) return;
  uploadStorage.remove(DATASHEET_DIR, path.basename(datasheetPath));
}

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${SITE_SELECT} ORDER BY id`);
  res.json({ sites: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${SITE_SELECT} WHERE id = $1`, [id]);
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

  const inserted = await pool.query(
    "INSERT INTO sites (name) VALUES ($1) RETURNING id",
    [parsed.data.name]
  );
  const result = await pool.query(`${SITE_SELECT} WHERE id = $1`, [inserted.rows[0].id]);
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

  const updated = await pool.query(
    "UPDATE sites SET name = $1 WHERE id = $2 RETURNING id",
    [parsed.data.name, id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "Site introuvable." });
  }
  const result = await pool.query(`${SITE_SELECT} WHERE id = $1`, [id]);
  res.json({ site: result.rows[0] });
});

router.post("/:id/datasheet", (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  datasheetUpload.single("datasheet")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Erreur lors du téléversement." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni." });
    }
    const filename = `${id}-${Date.now()}${DATASHEET_MIME_EXTENSIONS[req.file.mimetype]}`;
    const existing = await pool.query("SELECT datasheet_path FROM sites WHERE id = $1", [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: "Site introuvable." });
    }
    await uploadStorage.save(req.file.buffer, DATASHEET_DIR, filename);
    await pool.query("UPDATE sites SET datasheet_path = $1 WHERE id = $2", [filename, id]);
    deleteDatasheetFile(existing.rows[0].datasheet_path);
    const result = await pool.query(`${SITE_SELECT} WHERE id = $1`, [id]);
    res.json({ site: result.rows[0] });
  });
});

router.delete("/:id/datasheet", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const existing = await pool.query("SELECT datasheet_path FROM sites WHERE id = $1", [id]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Site introuvable." });
  }
  await pool.query("UPDATE sites SET datasheet_path = NULL WHERE id = $1", [id]);
  deleteDatasheetFile(existing.rows[0].datasheet_path);
  const result = await pool.query(`${SITE_SELECT} WHERE id = $1`, [id]);
  res.json({ site: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const existing = await pool.query("SELECT datasheet_path FROM sites WHERE id = $1", [id]);
    const result = await pool.query("DELETE FROM sites WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Site introuvable." });
    }
    deleteDatasheetFile(existing.rows[0]?.datasheet_path);
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
