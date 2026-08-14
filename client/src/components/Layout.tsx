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
            <span className="brand-mark">N</span>
            NetworkManager
          </Link>
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
      <div className="shell">
        <aside className="sidebar">
          <NavLink to="/" end className="sidebar-link">
            Accueil
          </NavLink>
          {user?.role === "admin" && (
            <>
              <NavLink to="/data-types" className="sidebar-link">
                Type des données
              </NavLink>
              <NavLink to="/sites" className="sidebar-link">
                Gestion des Sites
              </NavLink>
              <NavLink to="/equipment" className="sidebar-link">
                Gestion du matériel
              </NavLink>
            </>
          )}
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
