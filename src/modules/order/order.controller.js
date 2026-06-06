import mongoose from "mongoose";
import { Order } from "./order.model.js";
import { Cart } from "../carts/cart.model.js";
import { Product } from "../products/product.model.js";
import { User } from "../user/user.model.js";

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

const getGlobalUnitsInCarts = async (productId) => {
  const result = await Cart.aggregate([
    { $unwind: "$items" },
    { $match: { "items.productId": new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, totalHeld: { $sum: "$items.quantity" } } },
  ]);
  return result.length > 0 ? result[0].totalHeld : 0;
};

// =========================================================================
// CONTROLLERS
// =========================================================================

// 1. CREATE INITIAL PENDING ORDER
export const createOrder = async (req, res, next) => {
  const { addressId, paymentMethod } = req.body || {};

  if (!paymentMethod) {
    return res
      .status(400)
      .json({ success: false, message: "Payment method is required!" });
  }

  try {
    const userId = req.user?.userId;

    const userProfile = await User.findById(userId);
    if (
      !userProfile ||
      !userProfile.address ||
      userProfile.address.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No delivery address profiles found on your account! Please configure an address before checking out.",
      });
    }

    const chosenAddress = addressId
      ? userProfile.address.id(addressId)
      : userProfile.address.find((addr) => addr.isDefault === true) ||
        userProfile.address[0];

    if (!chosenAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found!" });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot place order, your cart is empty!",
      });
    }

    let calculatedSubtotal = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      if (!product || !product.isActive) {
        return res.status(404).json({
          success: false,
          message: `Product '${item.name || "Unknown Item"}' is no longer available.`,
        });
      }

      const globalUnitsHeld = await getGlobalUnitsInCarts(product._id);
      const totalReservedByOthers = globalUnitsHeld - item.quantity;
      const realAvailableStock = product.quantity - totalReservedByOthers;

      if (realAvailableStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Stock reservation failed for '${product.productname}'. Only ${Math.max(0, realAvailableStock)} units remain available.`,
        });
      }

      calculatedSubtotal += product.price * item.quantity;

      orderItems.push({
        productId: product._id,
        productname: product.productname,
        price: product.price,
        quantity: item.quantity,
      });
    }

    const shippingFee = 30;
    const total = calculatedSubtotal + shippingFee;

    const newOrder = new Order({
      userId,
      items: orderItems,
      deliveryAddress: {
        label: chosenAddress.label,
        recieveName: chosenAddress.recieveName,
        recieveAddress: chosenAddress.recieveAddress,
        recieveTel: chosenAddress.recieveTel,
        isDefault: chosenAddress.isDefault,
      },
      subtotal: calculatedSubtotal,
      shippingFee,
      total,
      paymentMethod,
      status: "Pending",
    });

    await newOrder.save();

    cart.items = [];
    await cart.save();

    return res.status(201).json({
      success: true,
      message: `Order placed successfully! Used address profile: '${chosenAddress.label}'.`,
      data: newOrder,
    });
  } catch (error) {
    next(error);
  }
};

// 2. MARK ORDER AS PAID (Admin — deducts stock)
export const markOrderAsPaid = async (req, res, next) => {
  const { orderId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Order ID format!" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Order not found!" });
    }

    if (order.status === "Paid") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Order is already marked as Paid!" });
    }

    for (const item of order.items) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productId, quantity: { $gte: item.quantity } },
        { $inc: { quantity: -item.quantity } },
        { returnDocument: "after", session },
      );

      if (!updatedProduct) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Deduction failed! Not enough real inventory left for product: '${item.productname}'.`,
        });
      }
    }

    order.status = "Paid";
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message:
        "Payment confirmed successfully! Product stock has been officially deducted.",
      data: order,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    next(error);
  }
};

// 3. CANCEL ORDER (restocks only if already Paid)
export const cancelOrder = async (req, res, next) => {
  const { orderId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Order ID format!" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Order not found!" });
    }

    const isAdmin = req.user.role === "admin";
    if (!isAdmin && order.userId.toString() !== req.user.userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ success: false, message: "Access denied!" });
    }

    if (order.status === "Cancelled") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Order is already cancelled!" });
    }

    const previousStatus = order.status;

    if (previousStatus === "Paid") {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: item.quantity } },
          { session },
        );
      }
    }

    order.status = "Cancelled";
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message:
        previousStatus === "Paid"
          ? "Order cancelled successfully! Stock numbers have been returned to the catalog."
          : "Order cancelled successfully! (No stock adjustments were needed since order was not paid).",
      data: order,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    next(error);
  }
};

// 4. GET ALL ORDERS (Admin)
export const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username email tel");

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No orders found in the system.",
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      message: "All orders fetched successfully.",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};
