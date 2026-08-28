import { Router } from "express";
import { checkAuthentication } from "@/middlewares/checkAuthentication";
import { checkAuthorization } from "@/middlewares/checkAuthorization";
import { decryptPayload } from "@/middlewares/decyptPayload";
import {
  getAddonCatalog,
  purchaseAddon,
  handleAddonWebhook,
  assignProfessionalTester,
  fillProfessionalTester,
  cancelProfessionalTester,
  listProfessionalAssignments,
} from "@/controllers/addon.controller";

const router = Router();

router.get("/catalog", getAddonCatalog);
router.post("/purchase", checkAuthentication, decryptPayload, purchaseAddon);
router.post(
  "/webhook",
  // Signature verification is performed inside the controller because the
  // global express.json() middleware has already parsed the body. Raw-body
  // capture (set in server.ts via `verify` hook) makes req.rawBody available.
  handleAddonWebhook,
);

router.post(
  "/admin/professional-tester/assign",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  decryptPayload,
  assignProfessionalTester,
);
router.post(
  "/admin/professional-tester/:id/fill",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  decryptPayload,
  fillProfessionalTester,
);
router.post(
  "/admin/professional-tester/:id/cancel",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canUpdate" }),
  cancelProfessionalTester,
);
router.get(
  "/admin/assignments",
  checkAuthentication,
  checkAuthorization({ module: "submissions", action: "canReadList" }),
  listProfessionalAssignments,
);

export default router;
