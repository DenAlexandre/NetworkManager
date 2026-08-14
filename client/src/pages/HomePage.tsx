import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) return <p>Chargement...</p>;

  if (!user) {
    return (
      <div className="card hero-card">
        <h1>Bienvenue</h1>
        <p>Connecte-toi ou crée un compte pour accéder à ton espace.</p>
        <div className="hero-actions">
          <Link to="/login" className="btn btn-outline">
            Connecte-toi
          </Link>
          <Link to="/register" className="btn">
            Crée un compte
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Mon compte</h1>
      <dl className="account-info">
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
