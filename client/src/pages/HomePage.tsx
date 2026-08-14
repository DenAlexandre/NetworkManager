import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchApprovedRecipes } from "../api/recipes";
import type { Recipe } from "../api/recipes";

export function HomePage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApprovedRecipes()
      .then(({ recipes }) => setRecipes(recipes))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Chargement des recettes...</p>;

  return (
    <div>
      <h1>Recettes</h1>
      {recipes.length === 0 && <p>Aucune recette publiée pour le moment.</p>}
      <div className="recipe-grid">
        {recipes.map((recipe) => (
          <Link key={recipe.id} to={`/recettes/${recipe.id}`} className="recipe-card">
            <h2>{recipe.title}</h2>
            <p>{recipe.description}</p>
            <span className="muted">par {recipe.author_username}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
