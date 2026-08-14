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
import { SitesListPage } from "./pages/sites/SitesListPage";
import { SiteFormPage } from "./pages/sites/SiteFormPage";
import { SiteDetailPage } from "./pages/sites/SiteDetailPage";
import { ZoneFormPage } from "./pages/sites/ZoneFormPage";
import { ZoneDetailPage } from "./pages/sites/ZoneDetailPage";
import { RoomFormPage } from "./pages/sites/RoomFormPage";
import { RoomDetailPage } from "./pages/sites/RoomDetailPage";
import { EquipmentFormPage } from "./pages/sites/EquipmentFormPage";

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
                <SitesListPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/new"
            element={
              <AdminRoute>
                <SiteFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:id/edit"
            element={
              <AdminRoute>
                <SiteFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId"
            element={
              <AdminRoute>
                <SiteDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/new"
            element={
              <AdminRoute>
                <ZoneFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId/edit"
            element={
              <AdminRoute>
                <ZoneFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId"
            element={
              <AdminRoute>
                <ZoneDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId/rooms/new"
            element={
              <AdminRoute>
                <RoomFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId/rooms/:roomId/edit"
            element={
              <AdminRoute>
                <RoomFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId/rooms/:roomId"
            element={
              <AdminRoute>
                <RoomDetailPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId/rooms/:roomId/equipment/new"
            element={
              <AdminRoute>
                <EquipmentFormPage />
              </AdminRoute>
            }
          />
          <Route
            path="sites/:siteId/zones/:zoneId/rooms/:roomId/equipment/:equipmentId/edit"
            element={
              <AdminRoute>
                <EquipmentFormPage />
              </AdminRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
