import "dotenv/config";
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
import siteRoutes from "./routes/sites";
import zoneRoutes from "./routes/zones";
import roomRoutes from "./routes/rooms";
import equipmentRoutes from "./routes/equipment";
import equipmentLinkRoutes from "./routes/equipmentLinks";
import apiRoutes from "./routes/apis";

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/device-types", deviceTypeRoutes);
app.use("/api/link-types", linkTypeRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/hardware-models", hardwareModelRoutes);
app.use("/api/ports", portRoutes);
app.use("/api/sites", siteRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/equipment-links", equipmentLinkRoutes);
app.use("/api/apis", apiRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur interne." });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
