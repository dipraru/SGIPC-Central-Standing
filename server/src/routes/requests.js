import express from "express";
import bcrypt from "bcryptjs";
import { Request } from "../models/Request.js";
import { Passkey } from "../models/Passkey.js";

const router = express.Router();

const ensurePasskey = async () => {
  let record = await Passkey.findOne().lean();
  if (!record) {
    const keyHash = await bcrypt.hash("sgipc", 10);
    record = await Passkey.create({ keyHash });
  }
  return record;
};

const verifyPasskey = async (input) => {
  if (!input) return false;
  const record = await ensurePasskey();
  return bcrypt.compare(input, record.keyHash);
};

router.post("/request/handle", async (req, res) => {
  const { handle, name, roll, batch, passkey } = req.body;
  if (!handle || !name || !roll || !batch || !passkey) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  const created = await Request.create({
    type: "handle",
    handle: handle.trim(),
    name: name.trim(),
    roll: roll.trim(),
    batch: batch.trim(),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

router.post("/request/team", async (req, res) => {
  const { teamName, teamHandles, passkey } = req.body;
  if (!teamName || !teamHandles || !passkey) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  const created = await Request.create({
    type: "team",
    teamName: teamName.trim(),
    teamHandles: teamHandles.trim(),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

export default router;
