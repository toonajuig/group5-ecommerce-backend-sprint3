import { Router } from "express";
import { authUser, adminOnly } from "../middleware/authUser.js";
import { getAdminStats, getAdminOrders, getAdminProducts } from "../modules/admin/admin.controller.js";

export const router = Router();

router.get("/stats", authUser, adminOnly, getAdminStats);
router.get("/orders", authUser, adminOnly, getAdminOrders);
router.get("/products", authUser, adminOnly, getAdminProducts);
