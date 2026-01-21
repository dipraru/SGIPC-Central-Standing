import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import adminRoutes from "./routes/admin.js";
import standingsRoutes from "./routes/standings.js";
import { connectDb } from "./config/db.js";

dotenv.config();

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
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
