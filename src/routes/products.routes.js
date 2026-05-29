import { Router } from "express";

export const router = Router();
import {
  createProduct,
  getProducts,
  getProduct,
  deleteProduct,
  updateProduct,
} from "../modules/products/products.controller.js";

router.get("/:id", getProduct);
router.get("/", getProducts);
router.post("/", createProduct);
router.delete("/:id", deleteProduct);
router.put("/:id", updateProduct);
