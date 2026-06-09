import { Router } from "express";
import {
  createOrder,
  getMyOrders,
  getAllOrders,
  getOrder,
  updateOrder,
} from "../modules/order/order.controller.js";
import { authUser, adminOnly } from "../middleware/authUser.js";

export const router = Router();

router.post("/checkout", authUser, createOrder);
router.get("/", authUser, getMyOrders);
router.get("/all", authUser, adminOnly, getAllOrders);
router.get("/:orderId", authUser, getOrder);
router.put("/:orderId", authUser, updateOrder);
