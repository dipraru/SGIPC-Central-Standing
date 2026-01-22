import mongoose from "mongoose";

const ratingHistorySchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    rating: { type: Number, required: true },
  },
  { timestamps: true }
);

ratingHistorySchema.index({ handle: 1, date: 1 }, { unique: true });

export const RatingHistory = mongoose.model(
  "RatingHistory",
  ratingHistorySchema
);
