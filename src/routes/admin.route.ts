import { getControlRoomData } from "@/controllers/admin.controller";
import Router from "express";

const router = Router();

router.get("/get-control-room-data", getControlRoomData);

export default router;
