import { Router } from "express";
import {
  createOrder,
  getAllOrders,
  getOrder,
  updateOrder,
} from "../modules/order/order.controller.js";
import { authUser, adminOnly } from "../middleware/authUser.js";

export const router = Router();

// User Routes
router.post("/", authUser, createOrder);

// Admin / System Status Updates (Usually protected by an authAdmin middleware too)
router.get("/all", authUser, getAllOrders);
router.patch("/:orderId/cancel", authUser, getOrder);
//Edit order details & change order status
router.put("/:orderId", authUser, updateOrder);
