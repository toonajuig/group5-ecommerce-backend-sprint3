import { Cart } from "./cart.model.js";
import { Product } from "../products/product.model.js"; //For fetch productname, price, imageUrl from products.


export const addToCart = async (req, res, next) => {
  const { productId, quantity = 1 } = req.body || {};

  if (!productId) {
    return res.status(400).json({ success: false, message: "Product ID is required!" });
  }

  try {
    const userId = req.user?.userId;

    // 1. หา product และเช็คสต็อก
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({ success: false, message: "Not enough stock!" });
    }

    // 2. หา cart ของ user นี้ ถ้าไม่มีก็สร้างใหม่
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // 3. เช็คว่า product นี้อยู่ใน cart แล้วหรือยัง
    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        productId,
        quantity,
        price: product.price,
        name: product.productname,
        imageUrl: product.imageUrl,
      });
    }

    // 4. save
    await cart.save();

    res.status(200).json({ success: true, data: cart });

  } catch (error) {
    next(error);
  }
};
