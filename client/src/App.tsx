import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { SectionRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DataTypesLayout } from "./pages/dataTypes/DataTypesLayout";
import { DeviceTypesListPage } from "./pages/dataTypes/DeviceTypesListPage";
import { LinkTypesListPage } from "./pages/dataTypes/LinkTypesListPage";
import { ConfigurationTypesListPage } from "./pages/dataTypes/ConfigurationTypesListPage";
import { BrandsListPage } from "./pages/dataTypes/BrandsListPage";
import { HardwareModelsListPage } from "./pages/dataTypes/HardwareModelsListPage";
import { PortsDesignerPage } from "./pages/dataTypes/PortsDesignerPage";
import { VariablesPage } from "./pages/dataTypes/VariablesPage";
import { SitesLayout } from "./pages/sites/SitesLayout";
import { SitesListPage } from "./pages/sites/SitesListPage";
import { SiteDetailPage } from "./pages/sites/SiteDetailPage";
import { ZoneDetailPage } from "./pages/sites/ZoneDetailPage";
import { RoomDetailPage } from "./pages/sites/RoomDetailPage";
import { EquipmentLayout } from "./pages/equipment/EquipmentLayout";
import { EquipmentListPage } from "./pages/equipment/EquipmentListPage";
import { EquipmentLinksPage } from "./pages/equipment/EquipmentLinksPage";
import { ApisListPage } from "./pages/apis/ApisListPage";
import { AddressingPage } from "./pages/addressing/AddressingPage";
import { VariablesManagementPage } from "./pages/variables/VariablesManagementPage";
import { DesignPage } from "./pages/plans/DesignPage";
import { ConfigurationsLayout } from "./pages/configurations/ConfigurationsLayout";
import { SwitchConfigPage } from "./pages/configurations/SwitchConfigPage";
import { SwitchConfigDetailPage } from "./pages/configurations/SwitchConfigDetailPage";
import { MoxaConfigPage } from "./pages/configurations/MoxaConfigPage";
import { MoxaConfigDetailPage } from "./pages/configurations/MoxaConfigDetailPage";
import { ReportingPage } from "./pages/reporting/ReportingPage";
import { SystemLayout } from "./pages/system/SystemLayout";
import { DatabasePage } from "./pages/system/DatabasePage";
import { ImportExportPage } from "./pages/system/ImportExportPage";
import { RightsLayout } from "./pages/rights/RightsLayout";
import { RolesListPage } from "./pages/rights/RolesListPage";
import { PermissionsPage } from "./pages/rights/PermissionsPage";
import { UsersListPage } from "./pages/rights/UsersListPage";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route
            path="data-types"
            element={
              <SectionRoute section="data-types">
                <DataTypesLayout />
              </SectionRoute>
            }
          >
            <Route index element={<DeviceTypesListPage />} />
            <Route path="link-types" element={<LinkTypesListPage />} />
            <Route path="configuration-types" element={<ConfigurationTypesListPage />} />
            <Route path="brands" element={<BrandsListPage />} />
            <Route path="hardware-models" element={<HardwareModelsListPage />} />
            <Route path="ports" element={<PortsDesignerPage />} />
            <Route path="variables" element={<VariablesPage />} />
          </Route>
          <Route
            path="sites"
            element={
              <SectionRoute section="sites">
                <SitesLayout />
              </SectionRoute>
            }
          >
            <Route index element={<SitesListPage />} />
            <Route path=":siteId" element={<SiteDetailPage />} />
            <Route path=":siteId/zones/:zoneId" element={<ZoneDetailPage />} />
            <Route path=":siteId/zones/:zoneId/rooms/:roomId" element={<RoomDetailPage />} />
          </Route>
          <Route
            path="equipment"
            element={
              <SectionRoute section="equipment">
                <EquipmentLayout />
              </SectionRoute>
            }
          >
            <Route index element={<EquipmentListPage />} />
            <Route path="links" element={<EquipmentLinksPage />} />
            <Route path="addressing" element={<AddressingPage />} />
          </Route>
          <Route
            path="apis"
            element={
              <SectionRoute section="apis">
                <ApisListPage />
              </SectionRoute>
            }
          />
          <Route
            path="variables"
            element={
              <SectionRoute section="variables">
                <VariablesManagementPage />
              </SectionRoute>
            }
          />
          <Route
            path="plans"
            element={
              <SectionRoute section="plans">
                <DesignPage />
              </SectionRoute>
            }
          />
          <Route
            path="configurations"
            element={
              <SectionRoute section="configurations">
                <ConfigurationsLayout />
              </SectionRoute>
            }
          >
            <Route index element={<SwitchConfigPage />} />
            <Route path="moxa" element={<MoxaConfigPage />} />
            <Route path="moxa/:id" element={<MoxaConfigDetailPage />} />
            <Route path=":id" element={<SwitchConfigDetailPage />} />
          </Route>
          <Route
            path="reporting"
            element={
              <SectionRoute section="reporting">
                <ReportingPage />
              </SectionRoute>
            }
          />
          <Route
            path="system"
            element={
              <SectionRoute section="system">
                <SystemLayout />
              </SectionRoute>
            }
          >
            <Route index element={<DatabasePage />} />
            <Route path="import-export" element={<ImportExportPage />} />
          </Route>
          <Route
            path="rights"
            element={
              <SectionRoute section="rights">
                <RightsLayout />
              </SectionRoute>
            }
          >
            <Route index element={<RolesListPage />} />
            <Route path="droits" element={<PermissionsPage />} />
            <Route path="utilisateurs" element={<UsersListPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
