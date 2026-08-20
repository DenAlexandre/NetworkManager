import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission, SECTIONS } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("rights"));

const roleSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  permissions: z.array(
    z.object({
      section: z.enum(SECTIONS),
      accessLevel: z.enum(["read", "write"]),
    })
  ),
});

function roleQuery(whereClause = "", orderClause = "") {
  return `
    SELECT r.id, r.name, r.is_system AS "isSystem", r.is_admin AS "isAdmin",
           COUNT(DISTINCT u.id)::int AS "userCount",
           COALESCE(
             json_object_agg(rp.section, rp.access_level) FILTER (WHERE rp.section IS NOT NULL),
             '{}'
           ) AS permissions
    FROM roles r
    LEFT JOIN users u ON u.role_id = r.id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    ${whereClause}
    GROUP BY r.id
    ${orderClause}
  `;
}

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(roleQuery("", "ORDER BY r.id"));
  res.json({ roles: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(roleQuery("WHERE r.id = $1"), [id]);
  const role = result.rows[0];
  if (!role) {
    return res.status(404).json({ error: "Rôle introuvable." });
  }
  res.json({ role });
});

router.post("/", async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, permissions } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM roles WHERE name = $1", [name]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Ce rôle existe déjà." });
    }

    const inserted = await client.query(
      "INSERT INTO roles (name) VALUES ($1) RETURNING id",
      [name]
    );
    const roleId = inserted.rows[0].id;

    for (const p of permissions) {
      await client.query(
        "INSERT INTO role_permissions (role_id, section, access_level) VALUES ($1, $2, $3)",
        [roleId, p.section, p.accessLevel]
      );
    }

    await client.query("COMMIT");

    const result = await pool.query(roleQuery("WHERE r.id = $1"), [roleId]);
    res.status(201).json({ role: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, permissions } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query("SELECT is_admin FROM roles WHERE id = $1", [id]);
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rôle introuvable." });
    }
    // The Admin role is fully locked (name + permissions) — it bypasses role_permissions entirely
    // (see requirePermission), so its matrix isn't meaningful to edit, and there must always be one
    // unambiguous full-access role. Other system roles (e.g. the default "Utilisateur" role) can
    // still be renamed/reconfigured; only their deletion stays blocked (see DELETE below).
    if (target.rows[0].is_admin) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Le rôle Admin ne peut pas être modifié." });
    }

    const existing = await client.query("SELECT id FROM roles WHERE name = $1 AND id != $2", [name, id]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Ce rôle existe déjà." });
    }

    await client.query("UPDATE roles SET name = $1 WHERE id = $2", [name, id]);
    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [id]);
    for (const p of permissions) {
      await client.query(
        "INSERT INTO role_permissions (role_id, section, access_level) VALUES ($1, $2, $3)",
        [id, p.section, p.accessLevel]
      );
    }

    await client.query("COMMIT");

    const result = await pool.query(roleQuery("WHERE r.id = $1"), [id]);
    res.json({ role: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }

  const target = await pool.query("SELECT is_system FROM roles WHERE id = $1", [id]);
  if (!target.rowCount) {
    return res.status(404).json({ error: "Rôle introuvable." });
  }
  if (target.rows[0].is_system) {
    return res.status(400).json({ error: "Ce rôle système ne peut pas être supprimé." });
  }

  const userCount = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role_id = $1", [id]);
  if (userCount.rows[0].count > 0) {
    return res.status(409).json({
      error: `${userCount.rows[0].count} utilisateur(s) utilisent encore ce rôle.`,
      userCount: userCount.rows[0].count,
    });
  }

  await pool.query("DELETE FROM roles WHERE id = $1", [id]);
  res.status(204).send();
});

const replaceSchema = z.object({
  replacementId: z.number().int("Le rôle de remplacement est requis."),
});

// Reassigns every user on :id's role to replacementId, then deletes :id — lets the client offer
// "replace instead of delete" when the 409 above fires (same shape as deviceTypes.ts's /replace).
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
    return res.status(400).json({ error: "Choisissez un rôle différent." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query("SELECT is_system FROM roles WHERE id = $1", [id]);
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rôle introuvable." });
    }
    if (target.rows[0].is_system) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Ce rôle système ne peut pas être supprimé." });
    }

    const replacement = await client.query("SELECT id FROM roles WHERE id = $1", [replacementId]);
    if (!replacement.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rôle de remplacement introuvable." });
    }

    await client.query("UPDATE users SET role_id = $1 WHERE role_id = $2", [replacementId, id]);
    await client.query("DELETE FROM roles WHERE id = $1", [id]);

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
