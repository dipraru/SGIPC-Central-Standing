import mongoose from "mongoose";

const handleMetaSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, unique: true },
    lastUpdateDate: { type: String, required: true },
    currentRating: { type: Number, required: true },
    totalSolved: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export const HandleMeta = mongoose.model("HandleMeta", handleMetaSchema);
