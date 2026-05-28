import { Router } from "express";
import { Product } from "../models/products/products.model.js";
export const router = Router();
import {
  createProduct,
  getProducts,
  getProduct,
} from "../models/products/products.controller.js";

router.get("/:id", getProduct);
router.get("/", getProducts);
router.post("/", createProduct);
