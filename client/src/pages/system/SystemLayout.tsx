import { NavLink, Outlet } from "react-router-dom";

export function SystemLayout() {
  return (
    <div>
      <h1>Système</h1>
      <nav className="tabs">
        <NavLink to="/system" end className="tab">
          Base de données
        </NavLink>
        <NavLink to="/system/import-export" className="tab">
          Import/Export
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
