import mongoose from "mongoose";

const solvedProblemSchema = new mongoose.Schema(
  {
    contestId: { type: Number },
    index: { type: String },
    name: { type: String, required: true },
    rating: { type: Number },
  },
  { _id: false }
);

const dailySolvedSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    problems: { type: [solvedProblemSchema], default: [] },
  },
  { timestamps: true }
);

dailySolvedSchema.index({ handle: 1, date: 1 }, { unique: true });

export const DailySolved = mongoose.model("DailySolved", dailySolvedSchema);
