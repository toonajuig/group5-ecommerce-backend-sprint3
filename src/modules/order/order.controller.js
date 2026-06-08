import mongoose from "mongoose";
import { Order } from "./order.model.js";
import { Cart } from "../carts/cart.model.js";
import { Product } from "../products/product.model.js";
import { User } from "../user/user.model.js";
import { getGlobalUnitsReserved } from "../../utils/stock.utils.js";

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

      const globalUnitsHeld = await getGlobalUnitsReserved(product._id);
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

    const previousStatus = order.status;

    // Apply basic metadata updates safely
    if (deliveryAddress) order.deliveryAddress = deliveryAddress;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (shippingFee !== undefined) {
      order.shippingFee = shippingFee;
      order.total = order.subtotal + shippingFee;
    }

    // Process state alterations cleanly
    if (status && status !== previousStatus) {
      // RULE 1: Transitioning from Pending -> Paid (Deduct physical catalog stock)
      if (status === "Paid") {
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
              message: `Inventory deduction failed! Not enough stock left for product: '${item.productname}'.`,
            });
          }
        }
      }

      // RULE 2: Transitioning from Paid -> Canceled (Return stock to the shelves)
      if (status === "Canceled" && previousStatus === "Paid") {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { quantity: item.quantity } },
            { session },
          );
        }
      }

      // RULE 3: Transitioning from Pending -> Canceled
      // No database stock adjustments are required. Flipping this status text automatically
      // excludes the order from the getGlobalUnitsReserved query, un-freezing the stock!
      if (status === "Canceled" && previousStatus === "Pending") {
        console.log(
          `Order ${orderId} canceled from Pending status. Stock un-frozen automatically.`,
        );
      }

      // Guard: Block moving a Paid or Canceled order back to Pending
      if (
        (previousStatus === "Paid" || previousStatus === "Canceled") &&
        status === "Pending"
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Illegal state transition! Cannot revert an order back to Pending from '${previousStatus}'.`,
        });
      }

      order.status = status;
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message:
        "Order updated successfully in accordance with sprint stock rules.",
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
