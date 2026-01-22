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

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let dbConnected = false;

// Initialize database and admin user
async function initializeApp() {
  if (!dbConnected) {
    await connectDb(process.env.MONGODB_URI);
    dbConnected = true;

    const adminUsername = "admin";
    const adminPassword = "admin";
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    await Admin.findOneAndUpdate(
      { username: adminUsername },
      { username: adminUsername, passwordHash },
      { upsert: true, new: true }
    );
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminVjudgeRoutes);
app.use("/api", standingsRoutes);
app.use("/api", vjudgeRoutes);

// Vercel serverless function handler
export default async function handler(req, res) {
  try {
    await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error("Error initializing app:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
