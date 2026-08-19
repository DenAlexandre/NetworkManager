import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const portSchema = z.object({
  hardwareModelId: z.number().int("Le matériel est requis."),
  linkTypeId: z.number().int("Le type de liaison est requis."),
  configurationTypeId: z.number().int().nullable().optional(),
  label: z.string().min(1, "Le label du port est requis."),
});

const bulkPortSchema = z.object({
  hardwareModelId: z.number().int("Le matériel est requis."),
  linkTypeId: z.number().int("Le type de liaison est requis."),
  configurationTypeId: z.number().int().nullable().optional(),
  quantity: z.number().int().min(1, "La quantité doit être au moins 1.").max(200, "Quantité trop grande (max 200)."),
});

const regionSchema = z.object({
  regionX: z.number().min(0),
  regionY: z.number().min(0),
  regionWidth: z.number().min(1),
  regionHeight: z.number().min(1),
});

const PORT_SELECT = `
  SELECT p.id, p.hardware_model_id AS "hardwareModelId", p.link_type_id AS "linkTypeId",
         lt.name AS "portType", lt.color AS "linkTypeColor", lt.stroke_width AS "linkTypeStrokeWidth",
         p.configuration_type_id AS "configurationTypeId", ct.name AS "configurationTypeName",
         p.label,
         hm.name AS "hardwareModelName", b.name AS "manufacturerName",
         p.region_x AS "regionX", p.region_y AS "regionY",
         p.region_width AS "regionWidth", p.region_height AS "regionHeight"
  FROM hardware_model_ports p
  JOIN hardware_models hm ON hm.id = p.hardware_model_id
  JOIN brands b ON b.id = hm.brand_id
  JOIN link_types lt ON lt.id = p.link_type_id
  LEFT JOIN configuration_types ct ON ct.id = p.configuration_type_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function fkErrorMessage(err: unknown) {
  const constraint = (err as { constraint?: string }).constraint || "";
  if (constraint.includes("configuration_type")) {
    return "Type de configuration introuvable.";
  }
  if (constraint.includes("link_type")) {
    return "Type de liaison introuvable.";
  }
  return "Matériel introuvable.";
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${PORT_SELECT} ORDER BY p.id`);
  res.json({ ports: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${PORT_SELECT} WHERE p.id = $1`, [id]);
  const port = result.rows[0];
  if (!port) {
    return res.status(404).json({ error: "Entrée/sortie introuvable." });
  }
  res.json({ port });
});

router.post("/", async (req, res) => {
  const parsed = portSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { hardwareModelId, linkTypeId, configurationTypeId, label } = parsed.data;

  try {
    const inserted = await pool.query(
      `INSERT INTO hardware_model_ports (hardware_model_id, link_type_id, configuration_type_id, label) VALUES ($1, $2, $3, $4) RETURNING id`,
      [hardwareModelId, linkTypeId, configurationTypeId ?? null, label]
    );
    const result = await pool.query(`${PORT_SELECT} WHERE p.id = $1`, [inserted.rows[0].id]);
    res.status(201).json({ port: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: fkErrorMessage(err) });
    }
    throw err;
  }
});

router.post("/bulk", async (req, res) => {
  const parsed = bulkPortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { hardwareModelId, linkTypeId, configurationTypeId, quantity } = parsed.data;

  const linkTypeResult = await pool.query("SELECT name FROM link_types WHERE id = $1", [linkTypeId]);
  const linkType = linkTypeResult.rows[0];
  if (!linkType) {
    return res.status(400).json({ error: "Type de liaison introuvable." });
  }

  const countResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM hardware_model_ports WHERE hardware_model_id = $1 AND link_type_id = $2",
    [hardwareModelId, linkTypeId]
  );
  const startIndex = countResult.rows[0].count + 1;

  try {
    const insertedIds: number[] = [];
    for (let i = 0; i < quantity; i++) {
      const label = `${linkType.name} ${startIndex + i}`;
      const inserted = await pool.query(
        `INSERT INTO hardware_model_ports (hardware_model_id, link_type_id, configuration_type_id, label) VALUES ($1, $2, $3, $4) RETURNING id`,
        [hardwareModelId, linkTypeId, configurationTypeId ?? null, label]
      );
      insertedIds.push(inserted.rows[0].id);
    }
    const result = await pool.query(`${PORT_SELECT} WHERE p.id = ANY($1) ORDER BY p.id`, [insertedIds]);
    res.status(201).json({ ports: result.rows });
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
  const parsed = portSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { hardwareModelId, linkTypeId, configurationTypeId, label } = parsed.data;

  try {
    const updated = await pool.query(
      `UPDATE hardware_model_ports SET hardware_model_id = $1, link_type_id = $2, configuration_type_id = $3, label = $4 WHERE id = $5 RETURNING id`,
      [hardwareModelId, linkTypeId, configurationTypeId ?? null, label, id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ error: "Entrée/sortie introuvable." });
    }
    const result = await pool.query(`${PORT_SELECT} WHERE p.id = $1`, [id]);
    res.json({ port: result.rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: fkErrorMessage(err) });
    }
    throw err;
  }
});

router.put("/:id/region", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = regionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { regionX, regionY, regionWidth, regionHeight } = parsed.data;

  const updated = await pool.query(
    `UPDATE hardware_model_ports SET region_x = $1, region_y = $2, region_width = $3, region_height = $4 WHERE id = $5 RETURNING id`,
    [regionX, regionY, regionWidth, regionHeight, id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "Entrée/sortie introuvable." });
  }
  const result = await pool.query(`${PORT_SELECT} WHERE p.id = $1`, [id]);
  res.json({ port: result.rows[0] });
});

router.delete("/:id/region", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const updated = await pool.query(
    `UPDATE hardware_model_ports SET region_x = NULL, region_y = NULL, region_width = NULL, region_height = NULL WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "Entrée/sortie introuvable." });
  }
  const result = await pool.query(`${PORT_SELECT} WHERE p.id = $1`, [id]);
  res.json({ port: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  try {
    const result = await pool.query("DELETE FROM hardware_model_ports WHERE id = $1", [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: "Entrée/sortie introuvable." });
    }
    res.status(204).send();
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(409).json({
        error: "Ce port est utilisé par une liaison et ne peut pas être supprimé.",
      });
    }
    throw err;
  }
});

export default router;
