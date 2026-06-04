import { Product } from "../products/product.model.js";
import { User } from "../user/user.model.js";

export const getAdminProducts = async (req, res, next) => {
    try {
        const products = await Product.find({}).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, count: products.length, data: products });
    } catch (error) {
        next(error);
    }
};

export const getAdminStats = async (req, res, next) => {
    try {
        const [totalProducts, totalCustomers] = await Promise.all([
            Product.countDocuments({ isActive: true }),
            User.countDocuments({ role: "user" }),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalProducts,
                totalCustomers,
                totalOrders: 0,
                totalRevenue: 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const getAdminOrders = async (req, res, next) => {
    try {
        return res.status(200).json({ success: true, data: [] });
    } catch (error) {
        next(error);
    }
};
