import { NavLink, Outlet } from "react-router-dom";

export function RightsLayout() {
  return (
    <div>
      <h1>Gestion des droits</h1>
      <nav className="tabs">
        <NavLink to="/rights/utilisateurs" className="tab">
          Utilisateurs
        </NavLink>
        <NavLink to="/rights" end className="tab">
          Rôle
        </NavLink>
        <NavLink to="/rights/droits" className="tab">
          Droits
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
