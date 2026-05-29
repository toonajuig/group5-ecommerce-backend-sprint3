import mongoose from "mongoose";

export const addressSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  isDefault: {
    type: Boolean,
    default: true,
  },
});
