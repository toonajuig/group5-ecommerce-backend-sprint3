import { Router } from "express";
import {
  createOrder,
  markOrderAsPaid,
  cancelOrder,
  getAllOrders,
} from "../modules/order/order.controller.js";
import { authUser, adminOnly } from "../middleware/authUser.js";

export const router = Router();

// User Routes
router.post("/", authUser, createOrder);
router.post("/checkout", authUser, createOrder);

// Admin Routes
router.get("/all", authUser, adminOnly, getAllOrders);
router.patch("/:orderId/pay", authUser, adminOnly, markOrderAsPaid);
router.patch("/:orderId/cancel", authUser, cancelOrder);
