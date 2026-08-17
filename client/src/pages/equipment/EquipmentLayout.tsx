import { NavLink, Outlet } from "react-router-dom";

export function EquipmentLayout() {
  return (
    <div>
      <h1>Gestion du matériel</h1>
      <nav className="tabs">
        <NavLink to="/equipment" end className="tab">
          Matériel
        </NavLink>
        <NavLink to="/equipment/links" className="tab">
          Liaisons
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
