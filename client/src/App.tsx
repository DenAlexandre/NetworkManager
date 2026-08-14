import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { AdminRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DataTypesLayout } from "./pages/dataTypes/DataTypesLayout";
import { DeviceTypesListPage } from "./pages/dataTypes/DeviceTypesListPage";
import { LinkTypesListPage } from "./pages/dataTypes/LinkTypesListPage";
import { BrandsListPage } from "./pages/dataTypes/BrandsListPage";
import { HardwareModelsListPage } from "./pages/dataTypes/HardwareModelsListPage";
import { SitesLayout } from "./pages/sites/SitesLayout";
import { SitesListPage } from "./pages/sites/SitesListPage";
import { SiteDetailPage } from "./pages/sites/SiteDetailPage";
import { ZoneDetailPage } from "./pages/sites/ZoneDetailPage";
import { RoomDetailPage } from "./pages/sites/RoomDetailPage";
import { EquipmentLayout } from "./pages/equipment/EquipmentLayout";
import { EquipmentListPage } from "./pages/equipment/EquipmentListPage";
import { EquipmentLinksPage } from "./pages/equipment/EquipmentLinksPage";
import { ApisListPage } from "./pages/apis/ApisListPage";

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
              <AdminRoute>
                <DataTypesLayout />
              </AdminRoute>
            }
          >
            <Route index element={<DeviceTypesListPage />} />
            <Route path="link-types" element={<LinkTypesListPage />} />
            <Route path="brands" element={<BrandsListPage />} />
            <Route path="hardware-models" element={<HardwareModelsListPage />} />
          </Route>
          <Route
            path="sites"
            element={
              <AdminRoute>
                <SitesLayout />
              </AdminRoute>
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
              <AdminRoute>
                <EquipmentLayout />
              </AdminRoute>
            }
          >
            <Route index element={<EquipmentListPage />} />
            <Route path="links" element={<EquipmentLinksPage />} />
          </Route>
          <Route
            path="apis"
            element={
              <AdminRoute>
                <ApisListPage />
              </AdminRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
