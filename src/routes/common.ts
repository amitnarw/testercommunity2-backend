import { Router } from "express";
import authRouter from "./auth.route";
import userRouter from "./user.route";
import adminRouter from "./admin.route";
import dashboardRouter from "./dashboard.route";
import hubRouter from "./hub.route";
import r2Router from "./r2.route";
import billingRouter from "./billing.route";
import testerRouter from "./tester.route";

const router = Router();

router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/admin", adminRouter);
router.use("/dashboard", dashboardRouter);
router.use("/hub", hubRouter);
router.use("/R2", r2Router);
router.use("/billing", billingRouter);
router.use("/tester", testerRouter);

export default router;
