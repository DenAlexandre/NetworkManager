import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { pool } from "../db/pool";
import { signToken } from "../utils/jwt";
import { requireAuth } from "../middleware/auth";
import { getUserAccess } from "../permissions";

const router = Router();

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Le pseudo doit contenir au moins 3 caractères.")
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Le pseudo ne peut contenir que lettres, chiffres, '.', '_' ou '-'."),
  firstName: z.string().min(1, "Le prénom est requis."),
  lastName: z.string().min(1, "Le nom est requis."),
  email: z.string().email("Email invalide."),
  phone: z.string().min(6, "Numéro de téléphone invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { username, firstName, lastName, email, phone, password } = parsed.data;

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1 OR username = $2",
    [email, username]
  );
  if (existing.rowCount) {
    return res.status(409).json({ error: "Un compte existe déjà avec ce pseudo ou cet email." });
  }

  const defaultRole = await pool.query("SELECT id FROM roles WHERE is_default_registration_role = true LIMIT 1");
  const defaultRoleId = defaultRole.rows[0]?.id;
  if (!defaultRoleId) {
    return res.status(500).json({ error: "Aucun rôle par défaut n'est configuré." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(
    `INSERT INTO users (username, first_name, last_name, email, phone, password_hash, role_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [username, firstName, lastName, email, phone, passwordHash, defaultRoleId]
  );

  const user = await getUserAccess(inserted.rows[0].id);
  const token = signToken({ id: user!.id });
  res.cookie("token", token, COOKIE_OPTIONS);
  res.status(201).json({ user });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Pseudo ou mot de passe invalide." });
  }
  const { username, password } = parsed.data;

  const result = await pool.query(
    `SELECT id, password_hash FROM users WHERE username = $1`,
    [username]
  );
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ error: "Pseudo ou mot de passe invalide." });
  }

  const user = await getUserAccess(row.id);
  const token = signToken({ id: user!.id });
  res.cookie("token", token, COOKIE_OPTIONS);
  res.json({ user });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token", COOKIE_OPTIONS);
  res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
