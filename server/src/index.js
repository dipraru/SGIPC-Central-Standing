import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import adminRoutes from "./routes/admin.js";
import standingsRoutes from "./routes/standings.js";
import { connectDb } from "./config/db.js";
import { Admin } from "./models/Admin.js";
import bcrypt from "bcryptjs";

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
app.use("/api", standingsRoutes);

const port = process.env.PORT || 5000;

connectDb(process.env.MONGODB_URI)
  .then(async () => {
    const adminUsername = "admin";
    const adminPassword = "admin";
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    await Admin.findOneAndUpdate(
      { username: adminUsername },
      { username: adminUsername, passwordHash },
      { upsert: true, new: true }
    );

    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
