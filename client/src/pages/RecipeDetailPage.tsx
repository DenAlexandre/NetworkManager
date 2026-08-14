import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchRecipe } from "../api/recipes";
import type { Recipe } from "../api/recipes";
import { ApiError } from "../api/client";

const STATUS_LABELS: Record<Recipe["status"], string> = {
  pending: "En attente de validation",
  approved: "Validée",
  rejected: "Rejetée",
};

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchRecipe(id)
      .then(({ recipe }) => setRecipe(recipe))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur inconnue."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!recipe) return null;

  return (
    <article className="recipe-detail">
      <h1>{recipe.title}</h1>
      {recipe.status !== "approved" && (
        <p className={`status-badge status-${recipe.status}`}>{STATUS_LABELS[recipe.status]}</p>
      )}
      <p>{recipe.description}</p>

      <h2>Ingrédients</h2>
      <p className="preformatted">{recipe.ingredients}</p>

      <h2>Étapes</h2>
      <p className="preformatted">{recipe.steps}</p>
    </article>
  );
}
