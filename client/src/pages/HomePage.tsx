import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) return <p>Chargement...</p>;

  if (!user) {
    return (
      <div>
        <h1>Bienvenue</h1>
        <p>
          <Link to="/login">Connecte-toi</Link> ou{" "}
          <Link to="/register">crée un compte</Link> pour continuer.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Mon compte</h1>
      <dl>
        <dt>Pseudo</dt>
        <dd>{user.username}</dd>
        <dt>Nom</dt>
        <dd>
          {user.firstName} {user.lastName}
        </dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Téléphone</dt>
        <dd>{user.phone}</dd>
      </dl>
    </div>
  );
}
