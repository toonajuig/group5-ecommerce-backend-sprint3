import { Router } from "express";
import {
  createOrder,
  getAllOrders,
  getOrder,
  updateOrder,
} from "../modules/order/order.controller.js";
import { authUser, adminOnly } from "../middleware/authUser.js";

export const router = Router();

// 1. User Checkout Route
router.post("/", authUser, createOrder);

// 2. Admin Get All Orders (Keep this ABOVE the /:orderId parameter route)
router.get("/all", authUser, getAllOrders);

// 3. Admin/User Get Single Order Details (Fixed path mapping)
router.get("/:orderId", authUser, getOrder);

// 4. Unified Update & Status Handler (Handles Paid, Canceled, and address adjustments)
router.put("/:orderId", authUser, updateOrder);
