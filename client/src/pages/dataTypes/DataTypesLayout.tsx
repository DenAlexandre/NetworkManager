import { NavLink, Outlet } from "react-router-dom";

export function DataTypesLayout() {
  return (
    <div>
      <h1>Type des données</h1>
      <nav className="tabs">
        <NavLink to="/data-types" end className="tab">
          Types de matériel
        </NavLink>
        <NavLink to="/data-types/link-types" className="tab">
          Types de liaison
        </NavLink>
        <NavLink to="/data-types/brands" className="tab">
          Constructeurs
        </NavLink>
        <NavLink to="/data-types/hardware-models" className="tab">
          Matériel
        </NavLink>
        <NavLink to="/data-types/ports" className="tab">
          Gestion des ports
        </NavLink>
        <NavLink to="/data-types/variables" className="tab">
          Variables
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
