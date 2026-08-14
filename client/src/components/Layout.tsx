import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="app">
      <header className="navbar">
        <Link to="/" className="brand">
          🍲 Cuisine
        </Link>
        <nav>
          <NavLink to="/">Recettes</NavLink>
          {user && <NavLink to="/mes-recettes">Mes recettes</NavLink>}
          {user?.role === "admin" && <NavLink to="/admin">Administration</NavLink>}
        </nav>
        <div className="auth-actions">
          {user ? (
            <>
              <span>{user.username}</span>
              <button onClick={handleLogout}>Déconnexion</button>
            </>
          ) : (
            <>
              <Link to="/login">Connexion</Link>
              <Link to="/register">Inscription</Link>
            </>
          )}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
