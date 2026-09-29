import mongoose from "mongoose";

const solvedProblemItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    rating: { type: Number, default: null },
    contestId: { type: Number },
    index: { type: String },
    solvedAtSeconds: { type: Number },
    isRated: { type: Boolean, default: false },
    isGym: { type: Boolean, default: false },
  },
  { _id: false }
);

const handleSolvesSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, unique: true, trim: true, index: true },
    lastSubmissionId: { type: Number, default: 0 },
    lastSubmissionTime: { type: Number, default: 0 },
    totalSolvedCount: { type: Number, default: 0 },
    solvedList: [solvedProblemItemSchema],
  },
  { timestamps: true }
);

export const HandleSolves = mongoose.model("HandleSolves", handleSolvesSchema);
