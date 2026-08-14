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
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">C</span>
            Mon compte
          </Link>
          <nav>
            <NavLink to="/">Accueil</NavLink>
          </nav>
          <div className="auth-actions">
            {user ? (
              <>
                <span className="username">{user.username}</span>
                <button onClick={handleLogout}>Déconnexion</button>
              </>
            ) : (
              <>
                <Link to="/login">Connexion</Link>
                <Link to="/register">Inscription</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="app">
        <main>
          <Outlet />
        </main>
      </div>
    </>
  );
}
