import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { slackToNotionWorkflow } from "./workflows/slack-to-notion-workflow.js";

export const mastra = new Mastra({
  workflows: { slackToNotionWorkflow },
  storage: new LibSQLStore({
    url: process.env.DATABASE_URL || "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: (process.env.MASTRA_LOG_LEVEL as any) || "info",
  }),
});
