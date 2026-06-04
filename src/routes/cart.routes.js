import { Router } from "express";
import { authUser } from "../middleware/authUser.js"; // protect ด้วย JWT
import { addToCart } from "../modules/carts/cart.controller.js";


export const router = Router();

router.use(authUser); 

// router.get("/",       getCart);  

router.post("/",      addToCart);  

// router.put("/:itemId", updateCartItem); 
// router.delete("/:itemId", removeFromCart); 
// router.delete("/",    clearCart);      