import Router from "express";
import { getDashboardStats } from "@/controllers/dashboard.controller";
import { checkAuthentication } from "@/middlewares/checkAuthentication";

const router = Router();

router.get("/get-dashboard-stats", checkAuthentication, getDashboardStats);

export default router;
