import { Workflow, createStep } from "@mastra/core";
import { z } from "zod";
import { NotionService } from "../integrations/notion.js";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

const taskSchema = z.object({
  title: z.string().describe("A clear, concise title for the task"),
  description: z
    .string()
    .optional()
    .describe(
      "Additional details or context about the task, including any file references"
    ),
  priority: z
    .enum([
      "Quick ⚡",
      "Immediate 🔥",
      "Prio: 1st 🚀",
      "2nd Prio",
      "3rd Prio",
      "Remember 💭",
    ])
    .describe(
      "Task priority based on urgency keywords: immediate/fire -> 'Immediate 🔥', quick/lightning -> 'Quick ⚡', urgent/high priority -> 'Prio: 1st 🚀', 2nd/second -> '2nd Prio', remember -> 'Remember 💭', default -> '3rd Prio'"
    ),
  dueDate: z
    .string()
    .optional()
    .describe("Due date in YYYY-MM-DD format if mentioned"),
  assignee: z
    .string()
    .optional()
    .describe(
      "Either a Notion user ID from the provided list OR a Slack user ID (format: <@U12345>). Only set if explicitly mentioned in the message."
    ),
  includeFileIds: z
    .array(z.string())
    .optional()
    .describe(
      "Array of file IDs that should be included with the task. Only include files that are directly relevant to completing the task."
    ),
  project: z
    .string()
    .optional()
    .describe(
      "The project name this task belongs to. Must be one of the available projects listed below."
    ),
});

const parseMessageStep = createStep({
  id: "parse-message",
  description: "Parse Slack message to extract task details using AI",
  inputSchema: z.object({
    text: z.string(),
    user: z.string(),
    channel: z.string(),
    timestamp: z.string(),
    files: z.array(z.any()).optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum([
      "Quick ⚡",
      "Immediate 🔥",
      "Prio: 1st 🚀",
      "2nd Prio",
      "3rd Prio",
      "Remember 💭",
    ]),
    dueDate: z.string().optional(),
    assignee: z.string(),
    project: z.string().optional(),
    files: z.array(z.any()).optional(),
  }),
  execute: async ({ inputData }) => {
    const { text, user, files } = inputData;

    try {
      // Fetch Notion users and projects
      const notionService = new NotionService();
      const [notionUsers, availableProjects] = await Promise.all([
        notionService.getUsers(),
        notionService.getProjects(),
      ]);

      // Create a list of available users for the AI
      const userList = notionUsers
        .filter((u) => u.type === "person" && u.name)
        .map((u) => ({
          name: u.name,
          id: u.id,
          email: (u as any).person?.email || null,
        }));

      // Use AI to parse the message
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: taskSchema,
        prompt: `Parse this Slack conversation into a task. You are an AI assistant that helps extract actionable tasks from Slack conversations.

${
  text.includes("Channel conversation history") ||
  text.includes("Thread conversation")
    ? `
IMPORTANT: This includes conversation history from Slack. You may see:
- "Channel conversation history": Recent messages from the main channel
- "Thread conversation": Messages from a specific thread
- "Current message": The message that triggered this task creation

Analyze the conversations to:
1. Identify the main topic or request being discussed
2. Extract relevant context from both channel and thread messages
3. Understand the relationship between channel context and thread discussion
4. Determine if enough information is provided to create a meaningful task

Focus on:
- What action needs to be taken (prioritize thread context if available)
- Who is responsible (check both channel and thread for mentions)
- When it needs to be done (look for deadlines in both contexts)
- Any important background from channel that relates to the thread
- Requirements or constraints mentioned anywhere in the conversation
`
    : ""
}
        
Input: "${text}"

Today's date: ${new Date().toISOString().split("T")[0]}

Available Notion users for assignment:
${userList
  .map((u) => `- ${u.name}${u.email ? ` (${u.email})` : ""} - ID: ${u.id}`)
  .join("\n")}

Available projects:
${availableProjects.length > 0 ? availableProjects.map((p) => `- ${p.name}`).join("\n") : "- Instructa.ai - Website, SEO & Design (default)"}

Guidelines:
- Create a clear, actionable task title that captures the main request
- In the description, include:
  * Relevant context from the conversation
  * Any specific requirements or constraints mentioned
  * References to people, systems, or resources discussed
  * If the conversation seems to reference earlier context not provided, note: "Note: This conversation may reference earlier context not included here."
- Priority mapping:
  * "immediate", "urgent", "asap", "fire", "critical" → "Immediate 🔥"
  * "quick", "fast", "lightning" → "Quick ⚡"
  * "high priority", "important", "prio 1" → "Prio: 1st 🚀"
  * "second", "prio 2" → "2nd Prio"
  * "remember", "don't forget" → "Remember 💭"
  * default → "Prio: 1st 🚀"
- For assignees:
  * Match mentioned names to Notion users (case-insensitive, partial matches OK)
  * Handle @mentions (format: <@U12345>)
  * If no assignee mentioned, leave empty
- For due dates:
  * Convert relative dates (tomorrow, next week, etc.) to YYYY-MM-DD
  * Look for deadline mentions throughout the conversation
- If this is a multi-message conversation, synthesize information from all messages to create a comprehensive task
- File handling:
  * If files are mentioned in the conversation (shown as [File: filename (type)]), evaluate if they are relevant to the task
  * Only include files in includeFileIds that are directly needed for completing the task
  * Mention relevant files in the description explaining why they're important
  * Available files: ${files && files.length > 0 ? files.map((f: any) => `ID: ${f.id}, Name: ${f.name || "Untitled"}, Type: ${f.mimetype || "unknown"}`).join("; ") : "None"}
  * DO NOT include files that are just mentioned in passing or not relevant to the task itself
- Project selection:
  * Analyze the conversation to determine which project this task belongs to
  * Look for mentions of project names, product names, or areas of work
  * If no specific project is mentioned or unclear, use "Instructa.ai - Website, SEO & Design" as the default
  * Only select from the available projects listed above`,
      });

      // If no assignee was extracted, use the message sender
      const assignee = result.object.assignee || user;

      // Filter files based on AI selection
      let selectedFiles: any[] = [];
      if (
        result.object.includeFileIds &&
        result.object.includeFileIds.length > 0 &&
        files
      ) {
        selectedFiles = files.filter((file: any) =>
          result.object.includeFileIds?.includes(file.id)
        );
        console.log(
          `AI selected ${selectedFiles.length} out of ${files.length} files for the task`
        );
      }

      return {
        title: result.object.title,
        description: result.object.description,
        priority: result.object.priority || "3rd Prio",
        dueDate: result.object.dueDate,
        assignee,
        project:
          result.object.project || "Instructa.ai - Website, SEO & Design",
        files: selectedFiles,
      };
    } catch (error) {
      console.error(
        "AI parsing failed, falling back to simple parsing:",
        error
      );

      // Fallback to simple parsing - no files included by default
      const lines = text.split("\n");
      const title = lines[0] || "New Task from Slack";
      const description = lines.slice(1).join("\n") || "";

      return {
        title,
        description,
        priority: "3rd Prio" as
          | "Quick ⚡"
          | "Immediate 🔥"
          | "Prio: 1st 🚀"
          | "2nd Prio"
          | "3rd Prio"
          | "Remember 💭",
        dueDate: undefined,
        assignee: user,
        project: "Instructa.ai - Website, SEO & Design",
        files: [],
      };
    }
  },
});

const createTaskStep = createStep({
  id: "create-task",
  description: "Create task in Notion",
  inputSchema: z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum([
      "Quick ⚡",
      "Immediate 🔥",
      "Prio: 1st 🚀",
      "2nd Prio",
      "3rd Prio",
      "Remember 💭",
    ]),
    dueDate: z.string().optional(),
    assignee: z.string(),
    project: z.string().optional(),
    files: z.array(z.any()).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string().optional(),
    taskUrl: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    try {
      const notionService = new NotionService();

      // Pass the files directly to the createTask method
      const result = await notionService.createTask(inputData);

      return {
        success: true,
        taskId: result.id,
        taskUrl: result.url,
        message: `Task created successfully: ${result.url}`,
      };
    } catch (error: any) {
      console.error("Failed to create task:", error);
      return {
        success: false,
        message: error.message || "Failed to create task in Notion",
      };
    }
  },
});

export const slackToNotionWorkflow = new Workflow({
  id: "slack-to-notion",
  description: "Creates a Notion task from Slack message",
  inputSchema: z.object({
    text: z.string(),
    user: z.string(),
    channel: z.string(),
    timestamp: z.string(),
    files: z.array(z.any()).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string().optional(),
    taskUrl: z.string().optional(),
    message: z.string(),
  }),
})
  .then(parseMessageStep)
  .then(createTaskStep)
  .commit();
