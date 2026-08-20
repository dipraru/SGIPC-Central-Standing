import mongoose from "mongoose";

const tfcConfigSchema = new mongoose.Schema(
  {
    topNLimit: {
      type: Number,
      default: 10,
      min: 1,
    },
  },
  { timestamps: true }
);

export const TfcConfig = mongoose.model("TfcConfig", tfcConfigSchema);
