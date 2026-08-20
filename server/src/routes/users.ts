import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../permissions";

const router = Router();
router.use(requireAuth, requirePermission("rights"));

const USER_LIST_QUERY = `
  SELECT u.id, u.username, u.first_name AS "firstName", u.last_name AS "lastName",
         u.email, u.phone, u.created_at AS "createdAt",
         r.id AS "roleId", r.name AS "roleName", r.is_admin AS "roleIsAdmin"
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

const usernameSchema = z
  .string()
  .min(3, "Le pseudo doit contenir au moins 3 caractères.")
  .max(50)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Le pseudo ne peut contenir que lettres, chiffres, '.', '_' ou '-'.");

const createUserSchema = z.object({
  username: usernameSchema,
  firstName: z.string().min(1, "Le prénom est requis."),
  lastName: z.string().min(1, "Le nom est requis."),
  email: z.string().email("Email invalide."),
  phone: z.string().min(6, "Numéro de téléphone invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
  roleId: z.number().int("Le rôle est requis."),
});

const updateUserSchema = z.object({
  username: usernameSchema,
  firstName: z.string().min(1, "Le prénom est requis."),
  lastName: z.string().min(1, "Le nom est requis."),
  email: z.string().email("Email invalide."),
  phone: z.string().min(6, "Numéro de téléphone invalide."),
  roleId: z.number().int("Le rôle est requis."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").optional(),
});

async function countAdmins(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }) {
  const result = await client.query(
    "SELECT COUNT(*)::int AS count FROM users u JOIN roles r ON r.id = u.role_id WHERE r.is_admin = true"
  );
  return result.rows[0].count as number;
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`${USER_LIST_QUERY} ORDER BY u.username`);
  res.json({ users: result.rows });
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const result = await pool.query(`${USER_LIST_QUERY} WHERE u.id = $1`, [id]);
  const user = result.rows[0];
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable." });
  }
  res.json({ user });
});

router.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { username, firstName, lastName, email, phone, password, roleId } = parsed.data;

  const role = await pool.query("SELECT id FROM roles WHERE id = $1", [roleId]);
  if (!role.rowCount) {
    return res.status(404).json({ error: "Rôle introuvable." });
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1 OR username = $2", [email, username]);
  if (existing.rowCount) {
    return res.status(409).json({ error: "Un compte existe déjà avec ce pseudo ou cet email." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(
    `INSERT INTO users (username, first_name, last_name, email, phone, password_hash, role_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [username, firstName, lastName, email, phone, passwordHash, roleId]
  );

  const result = await pool.query(`${USER_LIST_QUERY} WHERE u.id = $1`, [inserted.rows[0].id]);
  res.status(201).json({ user: result.rows[0] });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Identifiant invalide." });
  }
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { username, firstName, lastName, email, phone, roleId, password } = parsed.data;

  if (req.user!.id === id && roleId !== req.user!.role.id) {
    return res.status(400).json({ error: "Vous ne pouvez pas modifier votre propre rôle." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT u.id, r.is_admin AS "roleIsAdmin" FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [id]
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    const newRole = await client.query("SELECT is_admin AS \"isAdmin\" FROM roles WHERE id = $1", [roleId]);
    if (!newRole.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rôle introuvable." });
    }

    if (current.rows[0].roleIsAdmin && !newRole.rows[0].isAdmin) {
      const adminCount = await countAdmins(client);
      if (adminCount <= 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Impossible de retirer le dernier administrateur." });
      }
    }

    const conflict = await client.query(
      "SELECT id FROM users WHERE (email = $1 OR username = $2) AND id != $3",
      [email, username, id]
    );
    if (conflict.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Un compte existe déjà avec ce pseudo ou cet email." });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await client.query(
        `UPDATE users SET username = $1, first_name = $2, last_name = $3, email = $4, phone = $5,
                role_id = $6, password_hash = $7
         WHERE id = $8`,
        [username, firstName, lastName, email, phone, roleId, passwordHash, id]
      );
    } else {
      await client.query(
        `UPDATE users SET username = $1, first_name = $2, last_name = $3, email = $4, phone = $5,
                role_id = $6
         WHERE id = $7`,
        [username, firstName, lastName, email, phone, roleId, id]
      );
    }

    await client.query("COMMIT");

    const result = await pool.query(`${USER_LIST_QUERY} WHERE u.id = $1`, [id]);
    res.json({ user: result.rows[0] });
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
  if (req.user!.id === id) {
    return res.status(403).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query(
      `SELECT u.id, r.is_admin AS "roleIsAdmin" FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [id]
    );
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    if (target.rows[0].roleIsAdmin) {
      const adminCount = await countAdmins(client);
      if (adminCount <= 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Impossible de supprimer le dernier administrateur." });
      }
    }

    await client.query("DELETE FROM users WHERE id = $1", [id]);
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
