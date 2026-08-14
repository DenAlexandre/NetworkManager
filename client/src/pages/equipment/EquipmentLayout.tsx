import { NavLink, Outlet } from "react-router-dom";
import { EquipmentLinksTree } from "./EquipmentLinksTree";

export function EquipmentLayout() {
  return (
    <div>
      <h1>Gestion du matériel</h1>
      <div className="tree-shell">
        <aside className="tree-panel">
          <h2>Liaisons</h2>
          <EquipmentLinksTree />
        </aside>
        <div className="content">
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
      </div>
    </div>
  );
}
