import { Product } from "../products/product.model.js";
import { User } from "../user/user.model.js";
import { Order } from "../order/order.model.js";

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
        const [totalProducts, totalCustomers, totalOrders, revenueResult] = await Promise.all([
            Product.countDocuments({ isActive: true }),
            User.countDocuments({ role: "user" }),
            Order.countDocuments(),
            Order.aggregate([
                { $match: { status: "Paid" } },
                { $group: { _id: null, total: { $sum: "$total" } } },
            ]),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalProducts,
                totalCustomers,
                totalOrders,
                totalRevenue: revenueResult[0]?.total ?? 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const getAdminOrders = async (req, res, next) => {
    try {
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .populate("userId", "username email tel");

        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        next(error);
    }
};
