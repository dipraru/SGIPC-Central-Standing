import mongoose from "mongoose";

const vjudgeContestSchema = new mongoose.Schema(
  {
    contestId: { type: Number, required: true, unique: true },
    title: { type: String, trim: true, default: "" },
    enabled: { type: Boolean, default: true },
    ranklist: { type: [mongoose.Schema.Types.Mixed], default: null },
    participants: { type: mongoose.Schema.Types.Mixed, default: null },
    lastFetchedAt: { type: Date, default: null },
    fetchStatus: { type: String, default: "idle" },
    fetchError: { type: String, default: null },
  },
  { timestamps: true }
);

export const VjudgeContest = mongoose.model(
  "VjudgeContest",
  vjudgeContestSchema
);
