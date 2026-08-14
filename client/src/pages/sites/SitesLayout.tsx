import { Outlet } from "react-router-dom";
import { SitesTree } from "./SitesTree";
import { SitesTreeProvider } from "../../context/SitesTreeContext";

export function SitesLayout() {
  return (
    <SitesTreeProvider>
      <div className="tree-shell">
        <aside className="tree-panel">
          <h2>Gestion des Sites</h2>
          <SitesTree />
        </aside>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </SitesTreeProvider>
  );
}
