import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();

const recipeSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(1),
  ingredients: z.string().min(1),
  steps: z.string().min(1),
});

const RECIPE_FIELDS = `
  r.id, r.title, r.description, r.ingredients, r.steps, r.status,
  r.created_at, r.reviewed_at, r.author_id, u.username AS author_username
`;

// Liste publique des recettes approuvées
router.get("/", async (_req, res) => {
  const result = await pool.query(
    `SELECT ${RECIPE_FIELDS} FROM recipes r
     JOIN users u ON u.id = r.author_id
     WHERE r.status = 'approved'
     ORDER BY r.created_at DESC`
  );
  res.json({ recipes: result.rows });
});

// Recettes de l'utilisateur connecté, tous statuts confondus
router.get("/mine", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT ${RECIPE_FIELDS} FROM recipes r
     JOIN users u ON u.id = r.author_id
     WHERE r.author_id = $1
     ORDER BY r.created_at DESC`,
    [req.user!.id]
  );
  res.json({ recipes: result.rows });
});

// Détail d'une recette (visible si approuvée, ou si l'auteur/l'admin la consulte)
router.get("/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT ${RECIPE_FIELDS} FROM recipes r
     JOIN users u ON u.id = r.author_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  const recipe = result.rows[0];
  if (!recipe) {
    return res.status(404).json({ error: "Recette introuvable." });
  }

  if (recipe.status !== "approved") {
    const isOwner = req.user?.id === recipe.author_id;
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(404).json({ error: "Recette introuvable." });
    }
  }

  res.json({ recipe });
});

// Création d'une recette par un utilisateur connecté (statut initial: pending)
router.post("/", requireAuth, async (req, res) => {
  const parsed = recipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { title, description, ingredients, steps } = parsed.data;

  const result = await pool.query(
    `INSERT INTO recipes (title, description, ingredients, steps, author_id, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, title, description, ingredients, steps, status, created_at, author_id`,
    [title, description, ingredients, steps, req.user!.id]
  );

  res.status(201).json({ recipe: result.rows[0] });
});

// Modification par l'auteur, uniquement tant que la recette est en attente
router.put("/:id", requireAuth, async (req, res) => {
  const parsed = recipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const existing = await pool.query("SELECT author_id, status FROM recipes WHERE id = $1", [
    req.params.id,
  ]);
  const recipe = existing.rows[0];
  if (!recipe) {
    return res.status(404).json({ error: "Recette introuvable." });
  }
  if (recipe.author_id !== req.user!.id) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (recipe.status !== "pending") {
    return res.status(409).json({ error: "Seule une recette en attente peut être modifiée." });
  }

  const { title, description, ingredients, steps } = parsed.data;
  const result = await pool.query(
    `UPDATE recipes SET title = $1, description = $2, ingredients = $3, steps = $4
     WHERE id = $5
     RETURNING id, title, description, ingredients, steps, status, created_at, author_id`,
    [title, description, ingredients, steps, req.params.id]
  );

  res.json({ recipe: result.rows[0] });
});

// Suppression par l'auteur, uniquement tant que la recette est en attente
router.delete("/:id", requireAuth, async (req, res) => {
  const existing = await pool.query("SELECT author_id, status FROM recipes WHERE id = $1", [
    req.params.id,
  ]);
  const recipe = existing.rows[0];
  if (!recipe) {
    return res.status(404).json({ error: "Recette introuvable." });
  }
  if (recipe.author_id !== req.user!.id) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  if (recipe.status !== "pending") {
    return res.status(409).json({ error: "Seule une recette en attente peut être supprimée." });
  }

  await pool.query("DELETE FROM recipes WHERE id = $1", [req.params.id]);
  res.status(204).send();
});

export default router;
