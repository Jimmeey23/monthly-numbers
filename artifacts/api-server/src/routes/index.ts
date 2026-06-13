import { Router, type IRouter } from "express";
import healthRouter from "./health";
import managementReadoutRouter from "./management-readout";
import tableInsightRouter from "./table-insight";
import openaiChatRouter from "./openai-chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(managementReadoutRouter);
router.use(tableInsightRouter);
router.use(openaiChatRouter);

export default router;
