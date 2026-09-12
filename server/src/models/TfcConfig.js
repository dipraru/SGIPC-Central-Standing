import mongoose from "mongoose";

const tfcConfigSchema = new mongoose.Schema(
  {
    topNLimit: {
      type: Number,
      default: 10,
      min: 0,
    },
    publicTopNLimit: {
      type: Number,
      default: 10,
      min: 0,
    },
    publicMinParticipation: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminTopNLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminMinParticipation: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

export const TfcConfig = mongoose.model("TfcConfig", tfcConfigSchema);
