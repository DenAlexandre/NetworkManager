import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SidebarIcon } from "./SidebarIcon";
import type { SidebarIconName } from "./SidebarIcon";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "layout.sidebarCollapsed";

// Every link keeps its icon (plus a title tooltip) when the sidebar is collapsed, so navigation
// stays reachable without expanding it back — only the text label is hidden by CSS in that state.
const ADMIN_NAV_ITEMS: { to: string; icon: SidebarIconName; label: string }[] = [
  { to: "/data-types", icon: "layers", label: "Type des données" },
  { to: "/sites", icon: "pin", label: "Gestion des Sites" },
  { to: "/apis", icon: "exchange", label: "Gestion des API" },
  { to: "/equipment", icon: "server", label: "Gestion du matériel" },
  { to: "/plans", icon: "network", label: "Gestion des plans" },
  { to: "/reporting", icon: "chart", label: "Reporting" },
  { to: "/configurations", icon: "sliders", label: "Gestion des configurations" },
  { to: "/system", icon: "database", label: "Système" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1"
  );

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
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
        <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Afficher le menu" : "Rabattre le menu"}
          >
            {sidebarCollapsed ? "▸" : "◂"}
          </button>
          <NavLink to="/" end className="sidebar-link" title="Accueil">
            <span className="sidebar-icon"><SidebarIcon name="home" /></span>
            <span className="sidebar-label">Accueil</span>
          </NavLink>
          {user?.role === "admin" &&
            ADMIN_NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className="sidebar-link" title={item.label}>
                <span className="sidebar-icon"><SidebarIcon name={item.icon} /></span>
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            ))}
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
