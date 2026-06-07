import mongoose from "mongoose";
import { Order } from "./order.model.js";
import { Cart } from "../carts/cart.model.js";
import { Product } from "../products/product.model.js";
import { User } from "../user/user.model.js";
import { getGlobalUnitsReserved } from "../../utils/stock.utils.js";

// 1. CREATE INITIAL PENDING ORDER (Pulls Default Profile Address automatically)
export const createOrder = async (req, res, next) => {
  const { paymentMethod } = req.body || {};

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

    // 2. Scan the address array to find the profile set to isDefault: true
    // Fallback: If no address is explicitly marked default, pick the very first address in their array.
    const chosenAddress =
      userProfile.address.find((addr) => addr.isDefault === true) ||
      userProfile.address[0];

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

      const globalUnitsHeld = await getGlobalUnitsReserved(product._id);
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

//Get one order (admin/user)
export const getOrder = async (req, res, next) => {
  const { orderId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(orderID)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Order ID format!" });
  }

  try {
    const order = await Order.findById(orderId).populate(
      "userID",
      "username email tel",
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found!" });
    }

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully!",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

//5. Update oder datails & change status (admin only)
export const updateOrder = async (req, res, next) => {
  const { orderId } = req.params;
  const { status, deliveryAddress, shippingFee, paymentMethod } =
    req.body || {};

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Order ID format!" });
  }

  // Start a transaction session because if the status transitions to "Paid" or "Cancelled",
  // we are writing to both Orders and Products collections simultaneously.
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch the order document inside the protected transaction session
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Order not found!" });
    }

    const previousStatus = order.status;

    // 2. Apply general updates if they are passed in the request body
    if (deliveryAddress) order.deliveryAddress = deliveryAddress;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (shippingFee !== undefined) {
      order.shippingFee = shippingFee;
      order.total = order.subtotal + shippingFee; // Auto-recalculate total invoice
    }

    // 3. Evaluate Status Transitions & Core Business Logic Rules
    if (status && status !== previousStatus) {
      // RULE A: Transitioning from Pending -> Paid (Deduct stock from database)
      if (status === "Paid") {
        for (const item of order.items) {
          const updatedProduct = await Product.findOneAndUpdate(
            { _id: item.productId, quantity: { $gte: item.quantity } }, // Only deduct if enough physical stock exists
            { $inc: { quantity: -item.quantity } },
            { returnDocument: "after", session },
          );

          if (!updatedProduct) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              success: false,
              message: `Inventory deduction failed! Not enough database stock left for product: '${item.productname}'.`,
            });
          }
        }
      }

      // RULE B: Transitioning to Cancelled (Only restock shelves if the order was PREVIOUSLY paid)
      if (status === "Cancelled" && previousStatus === "Paid") {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { quantity: item.quantity } }, // Add items back onto database shelves
            { session },
          );
        }
      }

      // RULE C: Block illegal rollbacks (Prevent changing a Paid order back to Pending)
      if (previousStatus === "Paid" && status === "Pending") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message:
            "Illegal state transition! A Paid order cannot be reverted back to Pending status.",
        });
      }

      // If all rules pass, update the status property
      order.status = status;
    }

    // 4. Save mutations and commit transaction atomically
    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Order details updated successfully.",
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
