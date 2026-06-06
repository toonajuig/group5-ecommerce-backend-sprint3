import mongoose from "mongoose";
import { Cart } from "./cart.model.js";
import { Product } from "../products/product.model.js";

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

/**
 * Calculates the total quantity of a specific product currently held across ALL user carts.
 * This prevents overselling when inventory isn't deducted until payment.
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

// 1. ADD ITEM TO CART
export const addToCart = async (req, res, next) => {
  const { productId, quantity = 1 } = req.body || {};

  if (!productId) {
    return res
      .status(400)
      .json({ success: false, message: "Product ID is required!" });
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return res
      .status(400)
      .json({ success: false, message: "Quantity must be a positive integer" });
  }

  try {
    const userId = req.user?.userId;

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found or inactive!" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId,
    );
    const currentInCart = existingItem ? existingItem.quantity : 0;

    // Global Stock Allocation Logic
    const globalUnitsHeld = await getGlobalUnitsInCarts(productId);
    const totalReservedByOthers = globalUnitsHeld - currentInCart;
    const realAvailableStock = product.quantity - totalReservedByOthers;

    if (realAvailableStock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Cannot add to cart. Only ${Math.max(0, realAvailableStock)} units are available (others are locked in user carts).`,
      });
    }

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        productId,
        quantity,
        price: product.price,
        name: product.productname,
        imageUrl: product.imageUrl,
      });
    }

    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.productId",
    );
    return res.status(200).json({
      success: true,
      message: "Item added to cart successfully!",
      data: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};

// 2. UPDATE CART QUANTITY (DELTA ADJUSTMENTS)
export const updateCartQuantity = async (req, res, next) => {
  let { productId } = req.params;
  const { quantity } = req.body;

  if (typeof productId === "string") {
    productId = productId.replace(/['"]+/g, "").trim();
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Product ID format!" });
  }

  if (!Number.isInteger(quantity) || quantity === 0) {
    return res.status(400).json({
      success: false,
      message: "Quantity modification must be a non-zero integer",
    });
  }

  try {
    const userId = req.user?.userId;
    const product = await Product.findById(productId);

    if (!product || !product.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found or inactive!" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const itemIndex = cart.items.findIndex((item) => {
      const idToCompare =
        item.productId && item.productId._id
          ? item.productId._id
          : item.productId;
      return idToCompare.toString() === productId.toString();
    });

    if (itemIndex === -1 && quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot reduce item quantity; item is not in cart!",
      });
    }

    let targetQuantity = quantity;
    if (itemIndex > -1) {
      targetQuantity = cart.items[itemIndex].quantity + quantity;
    }

    if (targetQuantity < 0) {
      return res
        .status(400)
        .json({ success: false, message: "Quantity cannot be less than 0" });
    }

    // Global Stock Allocation Logic for Additions
    if (quantity > 0) {
      const currentInCart = itemIndex > -1 ? cart.items[itemIndex].quantity : 0;
      const globalUnitsHeld = await getGlobalUnitsInCarts(productId);

      const totalReservedByOthers = globalUnitsHeld - currentInCart;
      const realAvailableStock = product.quantity - totalReservedByOthers;

      if (realAvailableStock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock available. Only ${Math.max(0, realAvailableStock)} additional units left.`,
        });
      }
    }

    if (itemIndex > -1) {
      if (targetQuantity === 0) {
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = targetQuantity;
      }
    } else {
      cart.items.push({
        productId,
        quantity,
        price: product.price,
        name: product.productname,
        imageUrl: product.imageUrl,
      });
    }

    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.productId",
    );
    return res.status(200).json({
      success: true,
      message: "Cart updated successfully!",
      data: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};

// 3. FETCH ACTIVE CART
export const getCart = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const foundCart = await Cart.findOne({ userId }).populate(
      "items.productId",
    );

    if (!foundCart || foundCart.items.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Cart is empty!",
        data: { userId, items: [] },
      });
    }

    // Clean up catalog entries deleted by admins dynamically on read operations
    const initialLength = foundCart.items.length;
    foundCart.items = foundCart.items.filter((item) => item.productId !== null);

    if (foundCart.items.length !== initialLength) {
      await foundCart.save();
    }

    return res.status(200).json({
      success: true,
      message: "Cart fetched successfully",
      data: foundCart,
    });
  } catch (error) {
    next(error);
  }
};

// 4. CLEAR WHOLE CART
export const clearCart = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(200).json({
        success: true,
        message: "Cart is empty!",
        data: { userId, items: [] },
      });
    }

    cart.items = [];
    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Cart cleared!",
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

// 5. ABSOLUTE QUANTITY OVERRIDE
export const editCartItem = async (req, res, next) => {
  const { productId, quantity } = req.body || {};

  if (!productId || quantity === undefined) {
    return res.status(400).json({
      success: false,
      message: "Product ID and quantity are required!",
    });
  }

  const targetQuantity = Number(quantity);
  if (isNaN(targetQuantity) || targetQuantity < 0) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be higher than or equal to zero!",
    });
  }

  try {
    const userId = req.user?.userId;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found or inactive!" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId.toString(),
    );
    const currentInCart = itemIndex > -1 ? cart.items[itemIndex].quantity : 0;

    // Global Stock Allocation Logic for Increases
    if (targetQuantity > currentInCart) {
      const quantityRequestedDifference = targetQuantity - currentInCart;
      const globalUnitsHeld = await getGlobalUnitsInCarts(productId);

      const totalReservedByOthers = globalUnitsHeld - currentInCart;
      const realAvailableStock = product.quantity - totalReservedByOthers;

      if (realAvailableStock < quantityRequestedDifference) {
        return res.status(400).json({
          success: false,
          message: `Cannot update quantity. Only ${Math.max(0, realAvailableStock + currentInCart)} units total can be allocated to your cart.`,
        });
      }
    }

    if (itemIndex > -1) {
      if (targetQuantity === 0) {
        cart.items.splice(itemIndex, 1);
      } else {
        cart.items[itemIndex].quantity = targetQuantity;
      }
    } else {
      if (targetQuantity > 0) {
        cart.items.push({
          productId,
          quantity: targetQuantity,
          price: product.price,
          name: product.productname,
          imageUrl: product.imageUrl,
        });
      }
    }

    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.productId",
    );
    return res.status(200).json({
      success: true,
      message: "Cart item updated successfully",
      data: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};

// 6. DROP SINGLE ITEM COMPLETELY
export const removeCartItem = async (req, res, next) => {
  const { productId } = req.body;

  if (!productId) {
    return res
      .status(400)
      .json({ success: false, message: "Product ID is required!" });
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Product ID format!" });
  }

  try {
    const userId = req.user?.userId;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      {
        $pull: { items: { productId: new mongoose.Types.ObjectId(productId) } },
      },
      // === FIX: Swapped deprecated option here ===
      { returnDocument: "after" },
    );

    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found!" });
    }

    const updatedCart = await Cart.findById(cart._id).populate(
      "items.productId",
    );

    return res.status(200).json({
      success: true,
      message: "Item removed from cart successfully",
      data: updatedCart,
    });
  } catch (error) {
    next(error);
  }
};
