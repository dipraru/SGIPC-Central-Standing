import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import adminRoutes from "../server/src/routes/admin.js";
import adminVjudgeRoutes from "../server/src/routes/adminVjudge.js";
import standingsRoutes from "../server/src/routes/standings.js";
import vjudgeRoutes from "../server/src/routes/vjudge.js";
import { connectDb } from "../server/src/config/db.js";
import { Admin } from "../server/src/models/Admin.js";
import bcrypt from "bcryptjs";

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
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await Admin.findOneAndUpdate(
    { username: adminUsername },
    { username: adminUsername, passwordHash },
    { upsert: true, new: true }
  );
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
