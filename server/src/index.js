import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import adminRoutes from "./routes/admin.js";
import adminVjudgeRoutes from "./routes/adminVjudge.js";
import standingsRoutes from "./routes/standings.js";
import vjudgeRoutes from "./routes/vjudge.js";
import requestRoutes from "./routes/requests.js";
import { connectDb } from "./config/db.js";
import { Admin } from "./models/Admin.js";
import { Passkey } from "./models/Passkey.js";
import bcrypt from "bcryptjs";
import { startScheduler } from "./services/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
console.log("Loading .env...");
console.log(".env file path:", path.resolve(__dirname, "../.env"));
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "LOADED" : "MISSING");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminVjudgeRoutes);
app.use("/api", standingsRoutes);
app.use("/api", vjudgeRoutes);
app.use("/api", requestRoutes);

// Serve static files from React app
const clientDistPath = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDistPath));

// Catch-all route to serve React app
app.get("*", (req, res) => {
  res.sendFile(path.resolve(clientDistPath, "index.html"));
});

const port = process.env.PORT || 5000;

connectDb(process.env.MONGODB_URI)
  .then(async () => {
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

    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
      // Start the scheduler for daily data refresh
      startScheduler();
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
