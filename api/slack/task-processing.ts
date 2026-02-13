import { slackToNotionWorkflow } from "../mastra/workflows/slack-to-notion-workflow.js";
import {
  addReaction,
  describeFileForContext,
  fetchConversationHistory,
  postEphemeralResponse,
  postMessage,
  removeReaction,
} from "./client.js";

const NEED_MORE_CONTEXT_NOTE =
  "This conversation may reference earlier context not included here";

interface AppMentionInput {
  text: string;
  user: string;
  channel: string;
  threadTs: string;
  ts: string;
  files: any[];
}

interface DirectMessageInput {
  text: string;
  user: string;
  channel: string;
  ts: string;
  files: any[];
}

interface SlashTaskInput {
  text: string;
  userId: string;
  channelId: string;
  responseUrl: string;
}

function mergeFiles(historyFiles: any[], currentFiles: any[]): any[] {
  const fileMap = new Map<string, any>();

  for (const file of [...historyFiles, ...currentFiles]) {
    if (file?.id) {
      fileMap.set(file.id, file);
      continue;
    }

    const fallbackKey = `${file?.name || "untitled"}:${file?.mimetype || "unknown"}`;
    if (!fileMap.has(fallbackKey)) {
      fileMap.set(fallbackKey, file);
    }
  }

  return Array.from(fileMap.values());
}

function buildContextText(
  text: string,
  history: { thread: string[]; channel: string[] },
  currentFiles: any[],
  extended = false
): string {
  const hasHistory = history.thread.length > 0 || history.channel.length > 0;
  const fileSuffix =
    currentFiles.length > 0
      ? ` ${currentFiles.map(describeFileForContext).join(", ")}`
      : "";

  if (!hasHistory) {
    return `${text}${fileSuffix}`;
  }

  const channelLabel = extended
    ? "Extended channel conversation history"
    : "Channel conversation history";
  const threadLabel = extended
    ? "Extended thread conversation"
    : "Thread conversation";

  const sections: string[] = [];

  if (history.channel.length > 0) {
    sections.push(
      `${channelLabel} (${history.channel.length} messages):\n${history.channel.join("\n")}`
    );
  }

  if (history.thread.length > 0) {
    sections.push(
      `${threadLabel} (${history.thread.length} messages):\n${history.thread.join("\n")}`
    );
  }

  sections.push(`Current message: ${text}${fileSuffix}`);

  return sections.join("\n\n");
}

function getWorkflowOutput(result: any): any {
  return result?.result || result?.output || result?.data || result;
}

function formatWorkflowError(result: any): string {
  const output = getWorkflowOutput(result);

  if (output?.message) {
    return output.message;
  }

  if (result?.error?.message) {
    return result.error.message;
  }

  return "Unknown error";
}

async function runWorkflow(inputData: {
  text: string;
  user: string;
  channel: string;
  timestamp: string;
  files: any[];
}) {
  const run = await slackToNotionWorkflow.createRun();
  return run.start({ inputData });
}

export async function processAppMentionAsync(input: AppMentionInput): Promise<void> {
  let processingReactionAdded = false;

  try {
    await addReaction(input.channel, input.ts, "hourglass_flowing_sand");
    processingReactionAdded = true;

    let messageLimit = 20;
    let history = await fetchConversationHistory(
      input.channel,
      input.threadTs,
      input.ts,
      messageLimit
    );
    let allFiles = mergeFiles(history.files, input.files);
    let contextText = buildContextText(input.text, history, input.files);

    let workflowResult = await runWorkflow({
      text: contextText,
      user: input.user,
      channel: input.channel,
      timestamp: new Date().toISOString(),
      files: allFiles,
    });

    const firstOutput = getWorkflowOutput(workflowResult);
    if (
      workflowResult.status === "success" &&
      typeof firstOutput?.description === "string" &&
      firstOutput.description.includes(NEED_MORE_CONTEXT_NOTE) &&
      messageLimit < 50
    ) {
      messageLimit = 50;
      history = await fetchConversationHistory(
        input.channel,
        input.threadTs,
        input.ts,
        messageLimit
      );
      allFiles = mergeFiles(history.files, input.files);
      contextText = buildContextText(input.text, history, input.files, true);

      workflowResult = await runWorkflow({
        text: contextText,
        user: input.user,
        channel: input.channel,
        timestamp: new Date().toISOString(),
        files: allFiles,
      });
    }

    if (workflowResult.status === "success") {
      const output = getWorkflowOutput(workflowResult);
      if (output?.success) {
        await addReaction(input.channel, input.ts, "white_check_mark");
        const message = output.taskUrl
          ? `✅ Task created! View it here: ${output.taskUrl}`
          : "✅ Task created successfully!";
        await postMessage(input.channel, message, input.threadTs);
      } else {
        await addReaction(input.channel, input.ts, "x");
        await postMessage(
          input.channel,
          `❌ Failed to create task: ${formatWorkflowError(workflowResult)}`,
          input.threadTs
        );
      }
    } else {
      await addReaction(input.channel, input.ts, "x");
      await postMessage(
        input.channel,
        `❌ Failed to create task: ${formatWorkflowError(workflowResult)}`,
        input.threadTs
      );
    }
  } catch (error) {
    await addReaction(input.channel, input.ts, "x");
    await postMessage(
      input.channel,
      `❌ Error: ${error instanceof Error ? error.message : "An error occurred while creating the task."}`,
      input.threadTs
    );
  } finally {
    if (processingReactionAdded) {
      await removeReaction(input.channel, input.ts, "hourglass_flowing_sand");
    }
  }
}

export async function processDirectMessageAsync(
  input: DirectMessageInput
): Promise<void> {
  try {
    const history = await fetchConversationHistory(input.channel, "", input.ts, 10);
    const allFiles = mergeFiles(history.files, input.files);
    const contextText = buildContextText(input.text, history, input.files);

    const workflowResult = await runWorkflow({
      text: contextText,
      user: input.user,
      channel: input.channel,
      timestamp: new Date().toISOString(),
      files: allFiles,
    });

    if (workflowResult.status === "success") {
      const output = getWorkflowOutput(workflowResult);
      if (output?.success) {
        const message = output.taskUrl
          ? `✅ Task created! View it here: ${output.taskUrl}`
          : "✅ Task created successfully!";
        await postMessage(input.channel, message);
        return;
      }
    }

    await postMessage(
      input.channel,
      `❌ Failed to create task: ${formatWorkflowError(workflowResult)}`
    );
  } catch (error) {
    await postMessage(
      input.channel,
      `❌ Error: ${error instanceof Error ? error.message : "An error occurred while creating the task."}`
    );
  }
}

export async function processTaskAsync(input: SlashTaskInput): Promise<void> {
  try {
    const workflowResult = await runWorkflow({
      text: input.text,
      user: input.userId,
      channel: input.channelId,
      timestamp: new Date().toISOString(),
      files: [],
    });

    const output = getWorkflowOutput(workflowResult);
    const message =
      workflowResult.status === "success" && output?.success
        ? output.taskUrl
          ? `✅ Task created successfully! View it here: ${output.taskUrl}`
          : "✅ Task created successfully!"
        : `❌ Failed to create task: ${formatWorkflowError(workflowResult)}`;

    await postEphemeralResponse(input.responseUrl, message);
  } catch (error) {
    await postEphemeralResponse(
      input.responseUrl,
      `❌ Error: ${error instanceof Error ? error.message : "An error occurred while creating the task. Please try again."}`
    );
  }
}
