import mongoose from "mongoose";
import { Cart } from "./cart.model.js";
import { Product } from "../products/product.model.js"; //For fetch productname, price, imageUrl from products.


export const addToCart = async (req, res, next) => {
  const { productId, quantity = 1 } = req.body || {};

  if (!productId) {
    return res.status(400).json({ success: false, message: "Product ID is required!" });
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
  return res.status(400).json({
    success: false,
    message: "Quantity must be a positive integer",
  });
}

  try {
    const userId = req.user?.userId;

    // 1. หา product และเช็คสต็อก
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

// 2. หา cart ของ user นี้ ถ้าไม่มีก็สร้างใหม่
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // 3. เช็คว่า product นี้อยู่ใน cart แล้วหรือยัง
    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    const currentInCart = existingItem ? existingItem.quantity : 0;
    if (product.quantity < currentInCart + quantity) {
      return res.status(400).json({ success: false, message: "Not enough stock!" });
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

    // 4. save
    await cart.save();

    res.status(200).json({ success: true, data: cart });

  } catch (error) {
    next(error);
  }
};

export const updateCartQuantity = async (req, res, next) => {
  const { productId } = req.params;
  // ลบ const { quantity } = req.body ออก

  //Check if request productId is a valid Mongoose ObjectId format
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Product ID format!" });
  }

  //Start Mongoose session
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.userId;
    //Fetch product
    const product = await Product.findById(productId).session(session);

    if (!product || !product.isActive) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Product not found or inactive!" });
    }

    //Find cart OR create new cart
    let cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      cart = new Cart({ userId, items: [] });
      cart.$session(session);
    }

    //Check if item already in cart, result = -1 if not exist in card, >-1 if already in cart
    const itemIndex = cart.items.findIndex((item) => {
      const idToCompare =
        item.productId && item.productId._id
          ? item.productId._id
          : item.productId;
      return idToCompare.toString() === productId.toString();
    });

    let targetQuantity = quantity;
    //If product already in cart
    if (itemIndex > -1) {
      targetQuantity = cart.items[itemIndex].quantity + quantity;
    }

    const availableStock = Number(product.quantity);
    //Validate product stock, if stock from last session < targetQuantity -> response back to frontend
    if (availableStock < targetQuantity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Not enough stock, only ${product.quantity} left!`,
      });
    }

    //Update cart array, incase of product already in cart OR add new product to cart
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = targetQuantity;
    } else {
      cart.items.push({ productId, quantity });
    }

    //Save cart using the session
    await cart.save({ session });

    //Commit the transaction change
    await session.commitTransaction();
    session.endSession();

    //Fetch final data to response
    const updateCart = await Cart.findOne({ userId }).populate(
      "items.productId",
    );

    return res.status(200).json({
      success: true,
      message: "Item add to cart successfully!",
      data: updateCart,
      availableStock: product.quantity,
    });
  } catch (error) {
    //Rollback if any database error
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

export const getCart = async (req, res, next) => {
  try {
    const userId = req.user?.userId; //Get userId from authUser middleware
    //Find cart and brings all details
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

    //Option: Filter if product in cart not found in database (removed from product collection)
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

export const clearCart = async (req, res, next) => {
  try {
    const userId = req.user?.userId;

    //Find user's cart
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(200).json({
        success: true,
        message: "Cart is empty!",
        data: { userId, items: [] },
      });
    }

    //Clear all items from cart
    cart.items = [];
    await cart.save();

    return res.status(200).json({ success: true, message: "Cart cleared!" });
  } catch (error) {
    next(error);
  }
};

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
      message: "Quantity must higher than or equal to zero!",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?.userId;

    //Fetch user's cart
    let cart = await Cart.findOne({ userId }).session(session);
    if (!cart) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    //Find item index in cart array
    const itemIndex = cart.items.findIndex((item) => {
      const idToCompare =
        item.productId && item.productId._id
          ? item.productId._id
          : item.productId;

      return idToCompare.toString() === productId.toString();
    });

    //Not found product (index = -1)
    if (itemIndex === -1) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Product not found!" });
    }

    //Case 1: if target quantity = 0, remove product out of cart
    if (targetQuantity === 0) {
      cart.items.splice(itemIndex, 1);
    }
    //Case 2: update item quantity
    else {
      //Fetch product database to check quantity
      const product = await Product.findById(productId).session(session);
      if (!product || !product.isActive) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: "Product no longer available!" });
      }

      //Case product instock < target quantity
      if (product.quantity < targetQuantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Can not update quantity, Only ${product.quantity} item left in stock!`,
        });
      }

      //Update product quantity
      cart.items[itemIndex].quantity = targetQuantity;
    }

    //Save change and commit transaction
    await cart.save({ session });
    await session.commitTransaction();
    session.endSession();

    //Fetch and response final data
    const updateCart = await Cart.findOne({ userId }).populate(
      "items.productId",
    );

    return res.status(200).json({
      success: true,
      message:
        targetQuantity === 0 ? "Product removed from cart!" : "Cart updated!",
      data: updateCart,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

export const removeCartItem = async (req, res, next) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ success: false, message: "Product ID is required!" });
  }

  try {
    const userId = req.user?.userId;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $pull: { items: { productId } } },
      { new: true }
    );

    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found!" });
    }

    res.status(200).json({ success: true, data: cart });

  } catch (error) {
    next(error);
  }
};