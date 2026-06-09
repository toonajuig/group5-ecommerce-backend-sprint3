import mongoose from "mongoose";

//price, imageUrl with call from Product when user add product to cart.
const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          default: 1,
          min: [0, "Quantity can not be negative"],
        },

        price: { type: Number, required: true },
        name: { type: String },
        imageUrl: { type: String },
      },
    ],
  },
  { timestamps: true },
);

//Set cart expire (empty cart) if user logout or token expire with no cart checkout to make order
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 }); //86400 = 1 day

export const Cart = mongoose.model("Cart", cartSchema);
