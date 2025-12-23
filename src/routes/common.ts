import { Router } from "express";
import authRouter from "./auth.route";
import userRouter from "./user.route";
import adminRouter from "./admin.route";
import dashboardRouter from "./dashboard.route";
import hubRouter from "./hub.route";

const router = Router();

router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/admin", adminRouter);
router.use("/dashboard", dashboardRouter);
router.use("/hub", hubRouter);

export default router;
