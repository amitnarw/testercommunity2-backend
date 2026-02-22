import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  getTesterProjects,
  updateTesterAvailability,
} from "@/controllers/tester.controller";

const router = Router();

router.get("/get-projects", checkAuthentication, getTesterProjects);
router.put(
  "/availability",
  checkAuthentication,
  decryptPayload,
  updateTesterAvailability,
);

export default router;
