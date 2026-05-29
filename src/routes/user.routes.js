import { Router } from "express";

export const router = Router();

import {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
} from "../modules/user/user.controller.js";

router.post("/", createUser);
router.get("/", getUsers);
router.get("/:id", getUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
