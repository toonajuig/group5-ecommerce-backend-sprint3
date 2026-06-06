import mongoose from "mongoose";
import { Order } from "./order.model.js";
import { Cart } from "../carts/cart.model.js";
import { Product } from "../products/product.model.js";
import { User } from "../user/user.model.js";

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

/**
 * Calculates total product units sitting in active carts across ALL users.
 * Inherited directly from your cart logic to protect shared inventory space.
 */
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

// 1. CREATE INITIAL PENDING ORDER (Pulls Default Profile Address automatically)
export const createOrder = async (req, res, next) => {
  const { addressId, paymentMethod } = req.body || {};

  if (!paymentMethod) {
    return res
      .status(400)
      .json({ success: false, message: "Payment method is required!" });
  }

  try {
    const userId = req.user?.userId;

    // 1. Fetch user data to extract their saved address array
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

    // 2. Use addressId if provided, otherwise fall back to default or first address
    const chosenAddress = addressId
      ? userProfile.address.id(addressId)
      : userProfile.address.find((addr) => addr.isDefault === true) ||
        userProfile.address[0];

    if (!chosenAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found!" });
    }

    // 3. Fetch user's cart and populate raw catalog information
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot place order, your cart is empty!",
      });
    }

    let calculatedSubtotal = 0;
    const orderItems = [];

    // 4. Comprehensive validation pass across requested cart items
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
          message: `Stock reservation failed for '${product.productname}'. Only ${Math.max(0, realAvailableStock)} units remain available globally right now.`,
        });
      }

      calculatedSubtotal += product.price * item.quantity;

      orderItems.push({
        productId: product._id,
        productname: product.productname,
        price: product.price,
        quantity: item.quantity,
        imageUrl: product.imageUrl,
      });
    }

    const shippingFee = 30;
    const total = calculatedSubtotal + shippingFee;

    // 5. Initialize and persist the Order document using the chosen profile address subdocument
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

    // 6. Instantly empty user's cart to clear checkout state layout
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

// 2. MARK ORDER AS PAID (Admin Operation -> Deducts Stock)
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
    // 1. Fetch order within the protection session
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Order not found!" });
    }

    // Guard: Prevent double deduction if order is already paid
    if (order.status === "Paid") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Order is already marked as Paid!" });
    }

    // 2. Iterate over items to deduct physical inventory balances
    for (const item of order.items) {
      // Use atomic increment ($inc) with negative value to subtract quantity safely
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productId, quantity: { $gte: item.quantity } }, // Only deduct if enough actual physical stock exists
        { $inc: { quantity: -item.quantity } },
        { returnDocument: "after", session },
      );

      if (!updatedProduct) {
        // If findOneAndUpdate returns null, it means physical stock was depleted in the background
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Deduction failed! Not enough real inventory left for product: '${item.name}'.`,
        });
      }
    }

    // 3. Update order status to Paid
    order.status = "Paid";
    await order.save({ session });

    // 4. Commit operations together atomically
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

// 3. CANCEL ORDER (Restocks Inventory ONLY if it was already Paid)
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

    if (order.status === "Cancelled") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Order is already cancelled!" });
    }

    const previousStatus = order.status;

    // 1. If order was "Paid", we must return the deducted stock back to the shelf
    if (previousStatus === "Paid") {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: item.quantity } }, // Re-add inventory numbers
          { session },
        );
      }
    }

    // 2. Flip status property to Cancelled
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

// 4. GET ALL ORDERS (Admin Operation)
export const getAllOrders = async (req, res, next) => {
  try {
    // Fetch all orders, sorted by newest first (-1), and pull in user account details if needed
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("userId", "username email tel"); // Safely brings in buyer contact info

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
