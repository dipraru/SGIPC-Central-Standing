import express from "express";
import bcrypt from "bcryptjs";
import { Request } from "../models/Request.js";
import { Passkey } from "../models/Passkey.js";
import { Handle } from "../models/Handle.js";
import { VjudgeTeam } from "../models/VjudgeTeam.js";
import { getUserInfo } from "../services/codeforces.js";

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

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Individual Handle Request ───────────────────────────────────────────────
router.post("/request/handle", async (req, res) => {
  const { handle, name, roll, batch, passkey } = req.body;
  if (!handle || !name || !roll || !batch || !passkey) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const normalizedHandle = handle.trim();
  const normalizedRoll = roll.trim();

  // Guard: Handle already in standings
  const existingHandle = await Handle.findOne({
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });
  if (existingHandle) {
    return res.status(400).json({ message: "Handle already exists in standings" });
  }

  // Guard: Handle pending in requests
  const pendingHandle = await Request.findOne({
    type: "handle",
    status: "pending",
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });
  if (pendingHandle) {
    return res.status(400).json({ message: "Handle is already pending approval" });
  }

  // Guard: Roll already in standings
  const existingRoll = await Handle.findOne({
    roll: { $regex: `^${escapeRegex(normalizedRoll)}$`, $options: "i" },
  });
  if (existingRoll) {
    return res.status(400).json({
      message: `Roll "${normalizedRoll}" is already registered in standings (handle: ${existingRoll.handle})`,
    });
  }

  // Guard: Roll pending in requests
  const pendingRoll = await Request.findOne({
    type: "handle",
    status: "pending",
    roll: { $regex: `^${escapeRegex(normalizedRoll)}$`, $options: "i" },
  });
  if (pendingRoll) {
    return res.status(400).json({
      message: `A request for roll "${normalizedRoll}" is already pending approval`,
    });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  try {
    await getUserInfo(normalizedHandle);
  } catch (error) {
    return res.status(400).json({ message: "Invalid Codeforces handle" });
  }

  const created = await Request.create({
    type: "handle",
    handle: normalizedHandle,
    name: name.trim(),
    roll: normalizedRoll,
    batch: batch.trim(),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

// ─── Team Request (3 members required) ──────────────────────────────────────
router.post("/request/team", async (req, res) => {
  const { teamName, teamVjudgeHandle, members, passkey } = req.body;

  const normalizedTeamName = (teamName || "").trim();
  const vjHandle = (teamVjudgeHandle || "").trim();
  if (!normalizedTeamName || !vjHandle || !passkey) {
    return res.status(400).json({ message: "Team name, VJudge handle, and passkey are required" });
  }

  // Validate 3 members
  if (!Array.isArray(members) || members.length !== 3) {
    return res.status(400).json({ message: "Exactly 3 team members are required" });
  }
  for (let i = 0; i < 3; i++) {
    const m = members[i];
    if (!m?.name?.trim() || !m?.roll?.trim() || !m?.batch?.trim()) {
      return res.status(400).json({
        message: `All fields for member ${i + 1} are required (name, roll, batch)`,
      });
    }
  }

  // Guard: Internal distinct rolls within this team
  const rolls = members.map((m) => m.roll.trim());
  const lowerRolls = rolls.map((r) => r.toLowerCase());
  if (new Set(lowerRolls).size !== 3) {
    return res.status(400).json({ message: "Team members must have distinct roll numbers." });
  }

  // Guard: Team name already in VjudgeTeam
  const existingTeam = await VjudgeTeam.findOne({
    name: { $regex: `^${escapeRegex(normalizedTeamName)}$`, $options: "i" },
  });
  if (existingTeam) {
    return res.status(400).json({ message: `Team name "${normalizedTeamName}" already exists in team standings.` });
  }

  // Guard: Team name already pending in Request
  const pendingTeam = await Request.findOne({
    type: "team",
    status: "pending",
    teamName: { $regex: `^${escapeRegex(normalizedTeamName)}$`, $options: "i" },
  });
  if (pendingTeam) {
    return res.status(400).json({ message: `A team request for "${normalizedTeamName}" is already pending approval.` });
  }

  // Guard: Team VJudge handle already in VjudgeTeam (name or aliases)
  const existingVj = await VjudgeTeam.findOne({
    $or: [
      { name: { $regex: `^${escapeRegex(vjHandle)}$`, $options: "i" } },
      { aliases: { $regex: `^${escapeRegex(vjHandle)}$`, $options: "i" } },
    ],
  });
  if (existingVj) {
    return res.status(400).json({
      message: `VJudge handle "${vjHandle}" is already linked to team "${existingVj.name}".`,
    });
  }

  // Guard: Team VJudge handle already pending in Request
  const pendingVj = await Request.findOne({
    type: "team",
    status: "pending",
    teamHandles: { $regex: `^${escapeRegex(vjHandle)}$`, $options: "i" },
  });
  if (pendingVj) {
    return res.status(400).json({
      message: `A team request with VJudge handle "${vjHandle}" is already pending approval.`,
    });
  }

  // Guard: Any member roll already registered in an existing team
  const rollRegexes = rolls.map((r) => new RegExp(`^${escapeRegex(r)}$`, "i"));
  const existingMemberTeam = await VjudgeTeam.findOne({
    "members.roll": { $in: rollRegexes },
  });
  if (existingMemberTeam) {
    const conflict = existingMemberTeam.members.find((m) =>
      rolls.some((r) => r.toLowerCase() === (m.roll || "").toLowerCase())
    );
    return res.status(400).json({
      message: `Roll "${conflict?.roll || "number"}" is already a member of team "${existingMemberTeam.name}".`,
    });
  }

  // Guard: Any member roll already pending in another team request
  const pendingMemberRequest = await Request.findOne({
    type: "team",
    status: "pending",
    "teamMembers.roll": { $in: rollRegexes },
  });
  if (pendingMemberRequest) {
    const conflictRoll = rolls.find((r) =>
      pendingMemberRequest.teamMembers.some((m) => (m.roll || "").toLowerCase() === r.toLowerCase())
    );
    return res.status(400).json({
      message: `A team request including roll "${conflictRoll}" is already pending approval (team: "${pendingMemberRequest.teamName}").`,
    });
  }

  const isValid = await verifyPasskey(passkey);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid passkey" });
  }

  const created = await Request.create({
    type: "team",
    teamName: normalizedTeamName,
    teamHandles: vjHandle,
    teamMembers: members.map((m) => ({
      handle: (m.handle || "").trim(),
      name:   m.name.trim(),
      roll:   m.roll.trim(),
      batch:  m.batch.trim(),
    })),
    status: "pending",
  });

  return res.status(201).json({ message: "Request submitted", id: created._id });
});

// ─── Reactivation Request ────────────────────────────────────────────────────
router.post("/request/reactivate", async (req, res) => {
  const { handle } = req.body;
  if (!handle) {
    return res.status(400).json({ message: "Handle is required" });
  }

  const normalizedHandle = handle.trim();

  const handleDoc = await Handle.findOne({
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });

  if (!handleDoc) {
    return res.status(404).json({ message: "Handle not found" });
  }

  if (!handleDoc.isInactive) {
    return res.status(400).json({ message: "Handle is already active" });
  }

  const existing = await Request.findOne({
    type: "reactivation",
    status: "pending",
    handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" },
  });

  if (existing) {
    return res.status(400).json({ message: "A reactivation request is already pending for this handle" });
  }

  const created = await Request.create({
    type: "reactivation",
    handle:  handleDoc.handle,
    name:    handleDoc.name || "",
    batch:   handleDoc.batch || "",
    status:  "pending",
  });

  return res.status(201).json({ message: "Reactivation request submitted", id: created._id });
});

export default router;
