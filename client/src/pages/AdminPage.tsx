import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { approveRecipe, fetchPendingRecipes, rejectRecipe } from "../api/recipes";
import type { Recipe } from "../api/recipes";

export function AdminPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  function loadRecipes() {
    return fetchPendingRecipes().then(({ recipes }) => setRecipes(recipes));
  }

  useEffect(() => {
    loadRecipes().finally(() => setLoading(false));
  }, []);

  async function handleApprove(id: number) {
    await approveRecipe(id);
    await loadRecipes();
  }

  async function handleReject(id: number) {
    await rejectRecipe(id);
    await loadRecipes();
  }

  if (loading) return <p>Chargement...</p>;

  return (
    <div>
      <h1>Recettes en attente de validation</h1>
      {recipes.length === 0 && <p>Aucune recette en attente.</p>}
      <ul className="admin-list">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <div>
              <Link to={`/recettes/${recipe.id}`}>{recipe.title}</Link>
              <span className="muted"> — proposée par {recipe.author_username}</span>
            </div>
            <div className="admin-actions">
              <button onClick={() => handleApprove(recipe.id)}>Valider</button>
              <button onClick={() => handleReject(recipe.id)} className="danger">
                Rejeter
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
