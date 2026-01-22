import mongoose from "mongoose";

const vjudgeConfigSchema = new mongoose.Schema(
  {
    eloMode: {
      type: String,
      enum: ["normal", "gain-only", "zero-participation"],
      default: "normal",
    },
  },
  { timestamps: true }
);

export const VjudgeConfig = mongoose.model(
  "VjudgeConfig",
  vjudgeConfigSchema
);
