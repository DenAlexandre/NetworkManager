import { NavLink, Outlet } from "react-router-dom";

export function PlansLayout() {
  return (
    <div>
      <h1>Gestion des plans</h1>
      <nav className="tabs">
        <NavLink to="/plans" end className="tab">
          Gestion des ports
        </NavLink>
        <NavLink to="/plans/design" className="tab">
          Design
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
