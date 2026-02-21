import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { getTesterProjects } from "@/controllers/tester.controller";

const router = Router();

router.get("/get-projects", checkAuthentication, getTesterProjects);

export default router;
