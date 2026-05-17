import Router from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import {
  getDeclaration,
  updateDeclaration,
} from "@/controllers/declaration.controller";

const router = Router();

router.get("/:appId", checkAuthentication, getDeclaration);
router.put("/:appId", checkAuthentication, updateDeclaration);

export default router;
