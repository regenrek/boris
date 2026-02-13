import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { NotionService } from "../integrations/notion.js";

export const createNotionTask = createTool({
  id: "create-notion-task",
  description: "Creates a new task in Notion database",
  inputSchema: z.object({
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    priority: z.enum(["Quick ⚡", "Immediate 🔥", "Prio: 1st 🚀", "2nd Prio", "3rd Prio", "Remember 💭"]).optional().default("3rd Prio"),
    dueDate: z.string().optional().describe("Due date in ISO format"),
    assignee: z.string().optional().describe("Assignee name"),
    status: z
      .enum(["To be analysed", "Todo", "Blocked", "In Progress", "QA", "Ready to Deploy", "Fertig", "Archiviert"])
      .optional()
      .default("Todo"),
  }),
  outputSchema: z.object({
    id: z.string(),
    url: z.string(),
    success: z.boolean(),
  }),
  execute: async (inputData) => {
    try {
      const notionService = new NotionService();
      const result = await notionService.createTask(inputData);

      return result;
    } catch (error) {
      console.error("Error creating Notion task:", error);
      throw new Error("Failed to create task in Notion");
    }
  },
});
