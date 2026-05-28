import mongoose from "mongoose";
const productsSchema = new mongoose.Schema(
  {
    productname: {
      type: String,
      required: true,
      unique: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    kcal: {
      type: Number,
    },
    protein: {
      type: String,
    },
    //   categoryId: ObjectId, // ref: 'Category'
    tag: {
      type: String,
    }, // 'Best Seller', 'New', ...
    desc: {
      type: String,
    },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true }, // default: true
  },

  { timestamps: true },
);

export const Product = mongoose.model("Product", productsSchema);
