import mongoose from "mongoose";
import { Cart } from "../modules/carts/cart.model.js";
export const getGlobalUnitsReserved = async (productId) => {
  try {
    const prodId = new mongoose.Types.ObjectId(productId);

    // 1. Sum quantities across all active Carts
    const cartResult = await Cart.aggregate([
      { $unwind: "$items" },
      { $match: { "items.productId": prodId } },
      { $group: { _id: null, total: { $sum: "$items.quantity" } } },
    ]);
    const heldInCarts = cartResult.length > 0 ? cartResult[0].total : 0;

    // 2. Sum quantities across all "Pending" Orders (ordered but not yet paid)
    const orderResult = await mongoose
      .model("Order")
      .aggregate([
        { $match: { status: "Pending" } },
        { $unwind: "$items" },
        { $match: { "items.productId": prodId } },
        { $group: { _id: null, total: { $sum: "$items.quantity" } } },
      ]);
    const heldInPendingOrders =
      orderResult.length > 0 ? orderResult[0].total : 0;

    // Total absolute reservations holding stock space
    return heldInCarts + heldInPendingOrders;
  } catch (error) {
    console.error("Error calculating global reserved units:", error);
    throw error;
  }
};
