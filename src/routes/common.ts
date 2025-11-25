import { Router } from "express";
import authRouter from "./auth.route";
import { sendEmail } from "@/services/resend";

const router = Router();

router.use("/auth", authRouter);
router.use("/test", async (req, res) => {
  const response = await sendEmail({
    from: "Acme <onboarding@resend.dev>",
    to: "amitnarwal114@gmail.com",
    subject: "Verify your email address",
    html: `Click the link to verify your email: testUrl`,
  });
  console.log(response, "1111111");
  res.send(response);
});

export default router;
