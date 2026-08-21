import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";
import { uploadStorage } from "../services/uploadStorage";

const router = Router();
router.use(requireAuth, requirePermission("data-types"));

const hardwareModelSchema = z.object({
  brandId: z.number().int("Le constructeur est requis."),
  deviceTypeId: z.number().int("Le type de matériel est requis."),
  name: z.string().min(1, "Le nom est requis."),
  configImportEnabled: z.boolean().optional().default(false),
});

const HARDWARE_MODEL_SELECT = `
  SELECT hm.id, hm.brand_id AS "brandId", b.name AS "brandName",
         hm.device_type_id AS "deviceTypeId", dt.name AS "deviceType", hm.name,
         hm.image_path AS "imagePath", hm.datasheet_path AS "datasheetPath",
         hm.config_import_enabled AS "configImportEnabled"
  FROM hardware_models hm
  JOIN brands b ON b.id = hm.brand_id
  JOIN device_types dt ON dt.id = hm.device_type_id
`;

const IMAGE_DIR = "hardware-models";
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME_EXTENSIONS[file.mimetype]) {
      cb(new Error("Format d'image non supporté (png, jpg, gif ou webp uniquement)."));
      return;
    }
    cb(null, true);
  },
});

function deleteImageFile(imagePath: string | null | undefined) {
  if (!imagePath) return;
  uploadStorage.remove(IMAGE_DIR, path.basename(imagePath));
}

const DATASHEET_DIR = "hardware-model-datasheets";
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

function fkErrorMessage(err: unknown) {
  const constraint = (err as { constraint?: string }).constraint || "";
  if (constraint.includes("device_type")) {
    return "Type de matériel introuvable.";
  }
  return "Constructeur introuvable.";
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${HARDWARE_MODEL_SELECT} ORDER BY hm.id`);
  res.json({ hardwareModels: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
  const hardwareModel = result.rows[0];
  if (!hardwareModel) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  res.json({ hardwareModel });
});

router.post("/", async (req, res) => {
  const parsed = hardwareModelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { brandId, deviceTypeId, name, configImportEnabled } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM hardware_models WHERE brand_id = $1 AND name = $2",
    [brandId, name]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce matériel existe déjà pour ce constructeur." });
  }

  try {
    const inserted = await pool.query(
      "INSERT INTO hardware_models (brand_id, device_type_id, name, config_import_enabled) VALUES ($1, $2, $3, $4) RETURNING id",
      [brandId, deviceTypeId, name, configImportEnabled]
    );
    const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ hardwareModel: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: fkErrorMessage(err) });
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = hardwareModelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { brandId, deviceTypeId, name, configImportEnabled } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM hardware_models WHERE brand_id = $1 AND name = $2 AND id != $3",
    [brandId, name, id]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Ce matériel existe déjà pour ce constructeur." });
  }

  try {
    const updated = await pool.query(
      "UPDATE hardware_models SET brand_id = $1, device_type_id = $2, name = $3, config_import_enabled = $4 WHERE id = $5 RETURNING id",
      [brandId, deviceTypeId, name, configImportEnabled, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
    res.json({ hardwareModel: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: fkErrorMessage(err) });
    }
    throw err;
  }
});

router.post("/:id/image", (req, res, next) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  imageUpload.single("image")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Erreur lors du téléversement." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucune image fournie." });
    }
    const filename = `${id}-${Date.now()}${IMAGE_MIME_EXTENSIONS[req.file.mimetype]}`;
    const existing = await pool.query("SELECT image_path FROM hardware_models WHERE id = $1", [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    await uploadStorage.save(req.file.buffer, IMAGE_DIR, filename);
    await pool.query("UPDATE hardware_models SET image_path = $1 WHERE id = $2", [filename, id]);
    deleteImageFile(existing.rows[0].image_path);
    const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
    res.json({ hardwareModel: result.rows[0] });
  });
});

router.delete("/:id/image", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const existing = await pool.query("SELECT image_path FROM hardware_models WHERE id = $1", [id]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  await pool.query("UPDATE hardware_models SET image_path = NULL WHERE id = $1", [id]);
  deleteImageFile(existing.rows[0].image_path);
  const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
  res.json({ hardwareModel: result.rows[0] });
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
    const existing = await pool.query("SELECT datasheet_path FROM hardware_models WHERE id = $1", [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    await uploadStorage.save(req.file.buffer, DATASHEET_DIR, filename);
    await pool.query("UPDATE hardware_models SET datasheet_path = $1 WHERE id = $2", [filename, id]);
    deleteDatasheetFile(existing.rows[0].datasheet_path);
    const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
    res.json({ hardwareModel: result.rows[0] });
  });
});

router.delete("/:id/datasheet", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const existing = await pool.query("SELECT datasheet_path FROM hardware_models WHERE id = $1", [id]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: "Matériel introuvable." });
  }
  await pool.query("UPDATE hardware_models SET datasheet_path = NULL WHERE id = $1", [id]);
  deleteDatasheetFile(existing.rows[0].datasheet_path);
  const result = await pool.query(`${HARDWARE_MODEL_SELECT} WHERE hm.id = $1`, [id]);
  res.json({ hardwareModel: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const existing = await pool.query("SELECT image_path, datasheet_path FROM hardware_models WHERE id = $1", [id]);
    const result = await pool.query("DELETE FROM hardware_models WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Matériel introuvable." });
    }
    deleteImageFile(existing.rows[0]?.image_path);
    deleteDatasheetFile(existing.rows[0]?.datasheet_path);
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce matériel est utilisé par du matériel de zone et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
