import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import adminRoutes from "../server/src/routes/admin.js";
import adminVjudgeRoutes from "../server/src/routes/adminVjudge.js";
import standingsRoutes from "../server/src/routes/standings.js";
import vjudgeRoutes from "../server/src/routes/vjudge.js";
import requestRoutes from "../server/src/routes/requests.js";
import { connectDb } from "../server/src/config/db.js";
import { Admin } from "../server/src/models/Admin.js";
import { Passkey } from "../server/src/models/Passkey.js";
import bcrypt from "bcryptjs";
import { refreshAllHandles, refreshHandleData } from "../server/src/services/scheduler.js";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let dbConnected = false;

async function initializeApp() {
  if (dbConnected) return;
  await connectDb(process.env.MONGODB_URI);
  dbConnected = true;

  // Ensure default admin exists
  const adminUsername = "admin";
  const adminPassword = "admin";
  const existingAdmin = await Admin.findOne({ username: adminUsername }).lean();
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await Admin.create({ username: adminUsername, passwordHash });
  }

  const passkey = await Passkey.findOne().lean();
  if (!passkey) {
    const keyHash = await bcrypt.hash("sgipc", 10);
    await Passkey.create({ keyHash });
  }
}

// Health check (no debug details)
app.get("/api/health", async (req, res) => {
  try {
    await initializeApp();
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ status: "error" });
  }
});

app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminVjudgeRoutes);
app.use("/api", standingsRoutes);
app.use("/api", vjudgeRoutes);
app.use("/api", requestRoutes);

// Cron-triggered refresh endpoint (used by Vercel cron)
app.get("/api/cron/refresh", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ status: "unauthorized" });
  }

  try {
    await initializeApp();
    // Use incremental refresh by default to avoid serverless timeouts; allow overriding via ?full=1
    const fullHistory = req.query.full === "1";
    await refreshAllHandles({ fullHistory });
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Cron refresh error:", error);
    res.status(500).json({ status: "error" });
  }
});

// Chunked refresh for long-running refreshAllHandles (avoid 60s timeouts)
app.get("/api/cron/refresh-chunk", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "5", 10), 20), 1);

  try {
    await initializeApp();
    const fullHistory = req.query.full === "1";
    const handles = await import("../server/src/models/Handle.js").then((m) =>
      m.Handle.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
    );
    for (const h of handles) {
      await refreshHandleData(h.handle, { fullHistory });
    }
    res.json({ status: "ok", processed: handles.map((h) => h.handle), nextSkip: skip + handles.length });
  } catch (error) {
    console.error("Chunk refresh error:", error);
    res.status(500).json({ status: "error" });
  }
});

// Catch-all serverless handler
export default async function handler(req, res) {
  try {
    await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error("Error initializing app:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
