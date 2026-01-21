import mongoose from "mongoose";

export const connectDb = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Update server/.env");
  }
  await mongoose.connect(mongoUri, {
    autoIndex: true,
  });
};
