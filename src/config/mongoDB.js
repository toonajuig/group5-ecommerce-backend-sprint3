import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  try {
    await mongoose.connect(uri, { dbName: "group5_ecommerce" });
    console.log(`MongoDB Connected 🟢`);
  } catch (error) {
    console.error(`MongoDB Connection Failed 🔴`);
    throw error;
  }
}
