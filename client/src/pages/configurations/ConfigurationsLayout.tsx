import { NavLink, Outlet, useLocation } from "react-router-dom";

export function ConfigurationsLayout() {
  const location = useLocation();
  const isSwitchActive = !location.pathname.startsWith("/configurations/moxa");

  return (
    <div>
      <h1>Gestion des configurations</h1>
      <nav className="tabs">
        <NavLink to="/configurations" className={isSwitchActive ? "tab active" : "tab"}>
          Switch
        </NavLink>
        <NavLink to="/configurations/moxa" className="tab">
          Moxa
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
