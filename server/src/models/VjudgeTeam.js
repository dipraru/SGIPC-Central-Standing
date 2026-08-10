import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    name:  { type: String, trim: true, default: "" },
    roll:  { type: String, trim: true, default: "" },
    batch: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const vjudgeTeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    aliases: { type: [String], default: [] },
    members: { type: [teamMemberSchema], default: [] },
  },
  { timestamps: true }
);

export const VjudgeTeam = mongoose.model("VjudgeTeam", vjudgeTeamSchema);
