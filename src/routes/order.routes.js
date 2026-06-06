import { Router } from "express";
import {
  createOrder,
  markOrderAsPaid,
  cancelOrder,
  getAllOrders,
} from "../modules/order/order.controller.js";
import { authUser } from "../middleware/authUser.js"; // Adjust path to your file location

export const router = Router();

// User Route
router.post("/checkout", authUser, createOrder);

// Admin / System Status Updates (Usually protected by an authAdmin middleware too)
router.get("/all", authUser, getAllOrders);
router.patch("/:orderId/pay", authUser, markOrderAsPaid);
router.patch("/:orderId/cancel", authUser, cancelOrder);
