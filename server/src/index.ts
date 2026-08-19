import "dotenv/config";
import path from "path";
import express from "express";
import "express-async-errors";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import deviceTypeRoutes from "./routes/deviceTypes";
import linkTypeRoutes from "./routes/linkTypes";
import brandRoutes from "./routes/brands";
import hardwareModelRoutes from "./routes/hardwareModels";
import portRoutes from "./routes/ports";
import variableRoutes from "./routes/variables";
import siteRoutes from "./routes/sites";
import zoneRoutes from "./routes/zones";
import roomRoutes from "./routes/rooms";
import equipmentRoutes from "./routes/equipment";
import equipmentLinkRoutes from "./routes/equipmentLinks";
import equipmentPortSettingRoutes from "./routes/equipmentPortSettings";
import apiRoutes from "./routes/apis";
import designSchemaRoutes from "./routes/designSchemas";
import switchConfigRoutes from "./routes/switchConfigs";
import mgateConfigRoutes from "./routes/mgateConfigs";
import systemRoutes from "./routes/system";
import reportConfigRoutes from "./routes/reportConfigs";

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// Higher limit than the default 100kb: a full database backup/restore payload can exceed it, and
// keeps growing as more equipment/switch/moxa data is added — 25mb was already too tight (a real
// backup hit ~27mb) so this leaves generous headroom rather than needing another bump soon.
app.use(express.json({ limit: "200mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/device-types", deviceTypeRoutes);
app.use("/api/link-types", linkTypeRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/hardware-models", hardwareModelRoutes);
app.use("/api/ports", portRoutes);
app.use("/api/variables", variableRoutes);
app.use("/api/sites", siteRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/equipment-links", equipmentLinkRoutes);
app.use("/api/equipment-port-settings", equipmentPortSettingRoutes);
app.use("/api/apis", apiRoutes);
app.use("/api/design-schemas", designSchemaRoutes);
app.use("/api/switch-configs", switchConfigRoutes);
app.use("/api/mgate-configs", mgateConfigRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/report-configs", reportConfigRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur interne." });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
