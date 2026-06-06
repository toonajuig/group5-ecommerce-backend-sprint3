import { Router } from "express";
import { authUser } from "../middleware/authUser.js";

import {
  addToCart,
  getCart,
  clearCart,
  editCartItem,
  updateCartQuantity,
  removeCartItem, // Added missing import
} from "../modules/carts/cart.controller.js";

export const router = Router();

// 1. Get Current User's Cart
router.get("/", authUser, getCart);

// 2. Add an Item to Cart
router.post("/", authUser, addToCart);

// 3. Update Cart Item Quantity (Delta adjustments)
router.patch("/quantity/:productId", authUser, updateCartQuantity);

// 4. Edit Cart Item Quantity (Direct Override) - Fixed path to match Test #4
router.post("/edit", authUser, editCartItem);

// 5. Remove Single Item From Cart - Added path to match Test #5
router.post("/remove", authUser, removeCartItem);

// 6. Clear Entire Cart - Changed to POST to match your Test #6 script
router.post("/clear", authUser, clearCart);
