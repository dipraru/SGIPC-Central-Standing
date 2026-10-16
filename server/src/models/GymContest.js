import mongoose from "mongoose";

const problemSchema = new mongoose.Schema(
  {
    problemIndex: { type: String, required: true },
    name: { type: String, default: "" },
    contestSolves: { type: Number, default: 0 },
    allTimeSolves: { type: Number, default: 0 },
  },
  { _id: false }
);

const gymContestSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    type: { type: String, default: "ICPC" },
    phase: { type: String, default: "FINISHED" },
    durationSeconds: { type: Number, default: 0 },
    startTimeSeconds: { type: Number, default: 0, index: true },
    difficulty: { type: Number, default: 0, index: true },
    kind: { type: String, default: "" },
    season: { type: String, default: "" },
    city: { type: String, default: null },
    websiteUrl: { type: String, default: null },
    problemsCount: { type: Number, default: 0 },
    totalContestSolves: { type: Number, default: 0 },
    totalAllTimeSolves: { type: Number, default: 0 },
    hasProblemData: { type: Boolean, default: false, index: true },
    isDone: { type: Boolean, default: false, index: true },
    category: {
      type: String,
      enum: ["standard", "spike", "equilibrium", "unclassified"],
      default: "standard",
      index: true,
    },
    categoryScores: {
      standard: { type: Number, default: 0 },
      spike: { type: Number, default: 0 },
      equilibrium: { type: Number, default: 0 },
    },
    categoryExplanation: { type: String, default: "" },
    problems: [problemSchema],
    fetchedAt: { type: Date, default: Date.now },
    rawJson: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
  }
);

gymContestSchema.index({ startTimeSeconds: -1, id: -1 });
gymContestSchema.index({ category: 1, difficulty: 1, isDone: 1 });

export const GymContest = mongoose.model("GymContest", gymContestSchema);
