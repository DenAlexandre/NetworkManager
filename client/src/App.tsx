import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { AdminRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DataTypesLayout } from "./pages/dataTypes/DataTypesLayout";
import { DeviceTypesListPage } from "./pages/dataTypes/DeviceTypesListPage";
import { DeviceTypeFormPage } from "./pages/dataTypes/DeviceTypeFormPage";
import { LinkTypesListPage } from "./pages/dataTypes/LinkTypesListPage";
import { LinkTypeFormPage } from "./pages/dataTypes/LinkTypeFormPage";
import { BrandsListPage } from "./pages/dataTypes/BrandsListPage";
import { BrandFormPage } from "./pages/dataTypes/BrandFormPage";
import { HardwareModelsListPage } from "./pages/dataTypes/HardwareModelsListPage";
import { HardwareModelFormPage } from "./pages/dataTypes/HardwareModelFormPage";
import { SitesLayout } from "./pages/sites/SitesLayout";
import { SitesListPage } from "./pages/sites/SitesListPage";
import { SiteFormPage } from "./pages/sites/SiteFormPage";
import { SiteDetailPage } from "./pages/sites/SiteDetailPage";
import { ZoneFormPage } from "./pages/sites/ZoneFormPage";
import { ZoneDetailPage } from "./pages/sites/ZoneDetailPage";
import { RoomFormPage } from "./pages/sites/RoomFormPage";
import { RoomDetailPage } from "./pages/sites/RoomDetailPage";
import { EquipmentLayout } from "./pages/equipment/EquipmentLayout";
import { EquipmentListPage } from "./pages/equipment/EquipmentListPage";
import { EquipmentFormPage } from "./pages/equipment/EquipmentFormPage";
import { EquipmentLinksPage } from "./pages/equipment/EquipmentLinksPage";

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
            <Route path="new" element={<DeviceTypeFormPage />} />
            <Route path=":id/edit" element={<DeviceTypeFormPage />} />
            <Route path="link-types" element={<LinkTypesListPage />} />
            <Route path="link-types/new" element={<LinkTypeFormPage />} />
            <Route path="link-types/:id/edit" element={<LinkTypeFormPage />} />
            <Route path="brands" element={<BrandsListPage />} />
            <Route path="brands/new" element={<BrandFormPage />} />
            <Route path="brands/:id/edit" element={<BrandFormPage />} />
            <Route path="hardware-models" element={<HardwareModelsListPage />} />
            <Route path="hardware-models/new" element={<HardwareModelFormPage />} />
            <Route path="hardware-models/:id/edit" element={<HardwareModelFormPage />} />
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
            <Route path="new" element={<SiteFormPage />} />
            <Route path=":id/edit" element={<SiteFormPage />} />
            <Route path=":siteId" element={<SiteDetailPage />} />
            <Route path=":siteId/zones/new" element={<ZoneFormPage />} />
            <Route path=":siteId/zones/:zoneId/edit" element={<ZoneFormPage />} />
            <Route path=":siteId/zones/:zoneId" element={<ZoneDetailPage />} />
            <Route path=":siteId/zones/:zoneId/rooms/new" element={<RoomFormPage />} />
            <Route path=":siteId/zones/:zoneId/rooms/:roomId/edit" element={<RoomFormPage />} />
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
            <Route path="new" element={<EquipmentFormPage />} />
            <Route path=":id/edit" element={<EquipmentFormPage />} />
            <Route path="links" element={<EquipmentLinksPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
