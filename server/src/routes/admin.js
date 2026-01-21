import express from "express";
import jwt from "jsonwebtoken";
import { Handle } from "../models/Handle.js";

const router = express.Router();

const authRequired = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.admin = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (username !== adminUser || password !== adminPass) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET || "secret", {
    expiresIn: "12h",
  });

  return res.json({ token });
});

router.get("/handles", authRequired, async (req, res) => {
  const handles = await Handle.find().sort({ createdAt: -1 });
  return res.json(handles);
});

router.post("/handles", authRequired, async (req, res) => {
  const { handle } = req.body;
  if (!handle) {
    return res.status(400).json({ message: "Handle is required" });
  }

  const created = await Handle.create({ handle });
  return res.status(201).json(created);
});

router.put("/handles/:id", authRequired, async (req, res) => {
  const { handle } = req.body;
  if (!handle) {
    return res.status(400).json({ message: "Handle is required" });
  }

  const updated = await Handle.findByIdAndUpdate(
    req.params.id,
    { handle },
    { new: true }
  );

  if (!updated) {
    return res.status(404).json({ message: "Handle not found" });
  }

  return res.json(updated);
});

router.delete("/handles/:id", authRequired, async (req, res) => {
  const deleted = await Handle.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Handle not found" });
  }
  return res.status(204).send();
});

export default router;
