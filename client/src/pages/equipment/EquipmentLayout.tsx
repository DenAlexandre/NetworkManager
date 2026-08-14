import { NavLink, Outlet } from "react-router-dom";

export function EquipmentLayout() {
  return (
    <div>
      <h1>Matériel réseau</h1>
      <nav className="tabs">
        <NavLink to="/equipment" end className="tab">
          Équipements
        </NavLink>
        <NavLink to="/equipment/manufacturers" className="tab">
          Constructeurs
        </NavLink>
        <NavLink to="/equipment/ports" className="tab">
          Entrées / Sorties
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
