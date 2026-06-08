import { Router } from "express";
import {
    createOrder,
    getAllOrders,
    getOrder,
    updateOrder,
    cancelOrder,
} from "../modules/order/order.controller.js";
import { authUser, adminOnly } from "../middleware/authUser.js";

export const router = Router();

// User Routes
router.post("/", authUser, createOrder);

// Admin / System Status Updates (Usually protected by an authAdmin middleware too)
router.get("/all", authUser, adminOnly, getAllOrders);
router.patch("/:orderId/cancel", authUser, adminOnly, cancelOrder);
//Edit order details & change order status
// admin
router.put("/:orderId", authUser, adminOnly, updateOrder);
// anyone - see own order - 1 order
router.get("/:orderId", authUser, getOrder);
