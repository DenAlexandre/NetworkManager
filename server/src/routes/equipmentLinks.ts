import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const linkSchema = z.object({
  parentEquipmentId: z.number().int("Le matériel parent est requis."),
  parentPortId: z.number().int("Le port parent est requis."),
  childEquipmentId: z.number().int("Le matériel enfant est requis."),
  childPortId: z.number().int("Le port enfant est requis."),
});

const LINK_SELECT = `
  SELECT l.id,
         l.parent_equipment_id AS "parentEquipmentId", pe.name AS "parentEquipmentName",
         l.parent_port_id AS "parentPortId", pp.label AS "parentPortLabel",
         l.child_equipment_id AS "childEquipmentId", ce.name AS "childEquipmentName",
         l.child_port_id AS "childPortId", cp.label AS "childPortLabel"
  FROM equipment_links l
  JOIN equipment pe ON pe.id = l.parent_equipment_id
  JOIN equipment ce ON ce.id = l.child_equipment_id
  JOIN hardware_model_ports pp ON pp.id = l.parent_port_id
  JOIN hardware_model_ports cp ON cp.id = l.child_port_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

async function findPortMismatch(
  parentEquipmentId: number,
  parentPortId: number,
  childEquipmentId: number,
  childPortId: number
) {
  if (parentEquipmentId === childEquipmentId) {
    return "Le matériel parent et enfant doivent être différents.";
  }

  const result = await pool.query(
    `SELECT
       (SELECT hardware_model_id FROM equipment WHERE id = $1) AS "parentModel",
       (SELECT hardware_model_id FROM hardware_model_ports WHERE id = $2) AS "parentPortModel",
       (SELECT hardware_model_id FROM equipment WHERE id = $3) AS "childModel",
       (SELECT hardware_model_id FROM hardware_model_ports WHERE id = $4) AS "childPortModel"`,
    [parentEquipmentId, parentPortId, childEquipmentId, childPortId]
  );
  const row = result.rows[0];
  if (row.parentModel == null) return "Matériel parent introuvable.";
  if (row.childModel == null) return "Matériel enfant introuvable.";
  if (row.parentPortModel == null) return "Port parent introuvable.";
  if (row.childPortModel == null) return "Port enfant introuvable.";
  if (row.parentModel !== row.parentPortModel) {
    return "Le port parent n'appartient pas au matériel du modèle sélectionné.";
  }
  if (row.childModel !== row.childPortModel) {
    return "Le port enfant n'appartient pas au matériel du modèle sélectionné.";
  }
  return null;
}

async function findPortInUse(
  parentEquipmentId: number,
  parentPortId: number,
  childEquipmentId: number,
  childPortId: number,
  excludeId: number | null
) {
  const result = await pool.query(
    `SELECT id FROM equipment_links
     WHERE id != COALESCE($5, 0)
       AND (
         (parent_equipment_id = $1 AND parent_port_id = $2)
         OR (child_equipment_id = $1 AND child_port_id = $2)
         OR (parent_equipment_id = $3 AND parent_port_id = $4)
         OR (child_equipment_id = $3 AND child_port_id = $4)
       )`,
    [parentEquipmentId, parentPortId, childEquipmentId, childPortId, excludeId]
  );
  return result.rowCount ? true : false;
}

router.get("/", async (req, res) => {
  const equipmentId = req.query.equipmentId ? Number(req.query.equipmentId) : null;
  if (equipmentId !== null) {
    const result = await pool.query(
      `${LINK_SELECT} WHERE l.parent_equipment_id = $1 OR l.child_equipment_id = $1 ORDER BY l.id`,
      [equipmentId]
    );
    return res.json({ links: result.rows });
  }
  const result = await pool.query(`${LINK_SELECT} ORDER BY l.id`);
  res.json({ links: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${LINK_SELECT} WHERE l.id = $1`, [id]);
  const link = result.rows[0];
  if (!link) {
    return res.status(404).json({ error: "Liaison introuvable." });
  }
  res.json({ link });
});

router.post("/", async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { parentEquipmentId, parentPortId, childEquipmentId, childPortId } = parsed.data;

  const mismatch = await findPortMismatch(parentEquipmentId, parentPortId, childEquipmentId, childPortId);
  if (mismatch) {
    return res.status(400).json({ error: mismatch });
  }
  if (await findPortInUse(parentEquipmentId, parentPortId, childEquipmentId, childPortId, null)) {
    return res.status(409).json({ error: "Un des ports sélectionnés est déjà utilisé par une autre liaison." });
  }

  const inserted = await pool.query(
    `INSERT INTO equipment_links (parent_equipment_id, parent_port_id, child_equipment_id, child_port_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [parentEquipmentId, parentPortId, childEquipmentId, childPortId]
  );
  const result = await pool.query(`${LINK_SELECT} WHERE l.id = $1`, [inserted.rows[0].id]);
  res.status(201).json({ link: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { parentEquipmentId, parentPortId, childEquipmentId, childPortId } = parsed.data;

  const mismatch = await findPortMismatch(parentEquipmentId, parentPortId, childEquipmentId, childPortId);
  if (mismatch) {
    return res.status(400).json({ error: mismatch });
  }
  if (await findPortInUse(parentEquipmentId, parentPortId, childEquipmentId, childPortId, id)) {
    return res.status(409).json({ error: "Un des ports sélectionnés est déjà utilisé par une autre liaison." });
  }

  const updated = await pool.query(
    `UPDATE equipment_links
     SET parent_equipment_id = $1, parent_port_id = $2, child_equipment_id = $3, child_port_id = $4
     WHERE id = $5
     RETURNING id`,
    [parentEquipmentId, parentPortId, childEquipmentId, childPortId, id]
  );
  if (!updated.rowCount) {
    return res.status(404).json({ error: "Liaison introuvable." });
  }
  const result = await pool.query(`${LINK_SELECT} WHERE l.id = $1`, [id]);
  res.json({ link: result.rows[0] });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query("DELETE FROM equipment_links WHERE id = $1", [id]);
  if (!result.rowCount) {
    return res.status(404).json({ error: "Liaison introuvable." });
  }
  res.status(204).send();
});

export default router;
