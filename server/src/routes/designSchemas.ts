import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const layoutSchema = z.object({
  cards: z.array(
    z.object({
      equipmentId: z.number().int(),
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
    })
  ),
  bends: z.record(z.string(), z.number()),
  bendsY: z.record(z.string(), z.number()).optional(),
  paths: z.record(z.string(), z.array(z.object({ dx: z.number(), dy: z.number() }))).optional(),
  zoom: z.number().optional(),
  textBlocks: z
    .array(
      z.object({
        id: z.number(),
        x: z.number(),
        y: z.number(),
        fontSize: z.number(),
        text: z.string(),
      })
    )
    .optional(),
});

const schemaBodySchema = z.object({
  layout: layoutSchema,
});

const SCHEMA_SELECT = `
  SELECT id, api_id AS "apiId", layout, updated_at AS "updatedAt"
  FROM design_schemas
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${SCHEMA_SELECT} ORDER BY id`);
  res.json({ schemas: result.rows });
});

router.get("/:apiId", async (req, res) => {
  const apiId = parseId(req.params.apiId);
  if (apiId === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${SCHEMA_SELECT} WHERE api_id = $1`, [apiId]);
  res.json({ schema: result.rows[0] ?? null });
});

router.put("/:apiId", async (req, res) => {
  const apiId = parseId(req.params.apiId);
  if (apiId === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = schemaBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    await pool.query(
      `INSERT INTO design_schemas (api_id, layout)
       VALUES ($1, $2)
       ON CONFLICT (api_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()`,
      [apiId, JSON.stringify(parsed.data.layout)]
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return res.status(400).json({ error: "API introuvable." });
    }
    throw err;
  }
  const result = await pool.query(`${SCHEMA_SELECT} WHERE api_id = $1`, [apiId]);
  res.json({ schema: result.rows[0] });
});

export default router;
