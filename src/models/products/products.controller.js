import { Product } from "./products.model.js";

export const getProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    console.log(id);
    const foundProduct = await Product.findById(id);
    if (!foundProduct) {
      return res
        .status(404)
        .json({ success: false, message: `Product id ${id} not found!` });
    }
    return res.status(200).json({ success: true, data: foundProduct });
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message });
  }
};

export const getProducts = async (req, res, next) => {
  try {
    const allProducts = await Product.find();
    return res.status(200).json({ success: true, data: allProducts });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const createProduct = async (req, res, next) => {
  const {
    productname,
    price,
    quantity,
    kcal,
    protein,
    tag,
    desc,
    imageUrl,
    isActive,
  } = req.body || {};

  if (!productname || !price) {
    return res
      .status(400)
      .json({ success: false, message: "Productname and Price is required!" });
  }
  try {
    const newProduct = await Product.create({
      productname,
      price,
      quantity,
      kcal,
      protein,
      tag,
      desc,
      imageUrl,
      isActive,
    });
    return res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};
