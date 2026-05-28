import { Router } from "express";
import v1Routes from "./v1/v1.Routes.js"

const router = Router()

app.use("v1",v1Routes)

export default router 