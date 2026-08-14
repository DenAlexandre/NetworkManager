import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/recipes/pending", async (_req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.title, r.description, r.ingredients, r.steps, r.status,
            r.created_at, r.author_id, u.username AS author_username
     FROM recipes r
     JOIN users u ON u.id = r.author_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at ASC`
  );
  res.json({ recipes: result.rows });
});

router.post("/recipes/:id/approve", async (req, res) => {
  const result = await pool.query(
    `UPDATE recipes SET status = 'approved', reviewed_at = now(), reviewed_by = $1
     WHERE id = $2 AND status = 'pending'
     RETURNING id, title, status`,
    [req.user!.id, req.params.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ error: "Recette en attente introuvable." });
  }
  res.json({ recipe: result.rows[0] });
});

router.post("/recipes/:id/reject", async (req, res) => {
  const result = await pool.query(
    `UPDATE recipes SET status = 'rejected', reviewed_at = now(), reviewed_by = $1
     WHERE id = $2 AND status = 'pending'
     RETURNING id, title, status`,
    [req.user!.id, req.params.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ error: "Recette en attente introuvable." });
  }
  res.json({ recipe: result.rows[0] });
});

export default router;
