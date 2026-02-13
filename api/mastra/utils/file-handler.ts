import { fetchWithRetry } from "../../utils/http.js";

export interface SlackFileInfo {
  buffer: Buffer;
  name: string;
  mimetype: string;
  size: number;
}

const NOTION_API_VERSION = "2022-06-28";

function isAllowedSlackFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "slack.com" || parsed.hostname.endsWith(".slack.com"))
    );
  } catch {
    return false;
  }
}

function pickSlackDownloadUrl(file: any): string | null {
  const candidate = file?.url_private_download || file?.url_private;
  if (typeof candidate !== "string" || candidate.length === 0) {
    return null;
  }

  return isAllowedSlackFileUrl(candidate) ? candidate : null;
}

export async function downloadSlackFile(file: any): Promise<SlackFileInfo | null> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    console.error("Cannot download Slack file: SLACK_BOT_TOKEN is not set");
    return null;
  }

  const downloadUrl = pickSlackDownloadUrl(file);
  if (!downloadUrl) {
    return null;
  }

  try {
    const response = await fetchWithRetry(
      downloadUrl,
      {
        headers: {
          Authorization: `Bearer ${slackToken}`,
        },
      },
      {
        timeoutMs: 10_000,
        retries: 2,
      }
    );

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      name:
        typeof file?.name === "string" && file.name.trim().length > 0
          ? file.name
          : "untitled",
      mimetype:
        typeof file?.mimetype === "string" && file.mimetype.trim().length > 0
          ? file.mimetype
          : "application/octet-stream",
      size: buffer.length,
    };
  } catch (error) {
    console.error(
      "Error downloading Slack file:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export async function uploadFileToNotion(
  fileInfo: SlackFileInfo
): Promise<string | null> {
  const notionApiKey = process.env.NOTION_API_KEY;
  if (!notionApiKey) {
    console.error("Cannot upload file to Notion: NOTION_API_KEY is not set");
    return null;
  }

  try {
    const createResponse = await fetchWithRetry(
      "https://api.notion.com/v1/file_uploads",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionApiKey}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_API_VERSION,
        },
        body: JSON.stringify({
          filename: fileInfo.name,
          content_type: fileInfo.mimetype,
        }),
      },
      {
        timeoutMs: 10_000,
        retries: 2,
      }
    );

    if (!createResponse.ok) {
      return null;
    }

    const fileUpload = (await createResponse.json()) as { id?: string };
    if (!fileUpload.id) {
      return null;
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileInfo.buffer)], {
      type: fileInfo.mimetype,
    });
    formData.append("file", blob, fileInfo.name);

    const sendResponse = await fetchWithRetry(
      `https://api.notion.com/v1/file_uploads/${fileUpload.id}/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionApiKey}`,
          "Notion-Version": NOTION_API_VERSION,
        },
        body: formData,
      },
      {
        timeoutMs: 10_000,
        retries: 1,
      }
    );

    if (!sendResponse.ok) {
      return null;
    }

    return fileUpload.id;
  } catch (error) {
    console.error(
      "Error uploading file to Notion:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export function createFileNotionBlocks(
  fileInfo: SlackFileInfo,
  fileUploadId: string | null
): any[] {
  const blocks: any[] = [];

  if (fileUploadId) {
    if (fileInfo.mimetype.startsWith("image/")) {
      blocks.push({
        object: "block",
        type: "image",
        image: {
          type: "file_upload",
          file_upload: {
            id: fileUploadId,
          },
        },
      });
      return blocks;
    }

    if (fileInfo.mimetype === "application/pdf") {
      blocks.push({
        object: "block",
        type: "pdf",
        pdf: {
          type: "file_upload",
          file_upload: {
            id: fileUploadId,
          },
          caption: [
            {
              type: "text",
              text: {
                content: fileInfo.name,
              },
            },
          ],
        },
      });
      return blocks;
    }

    blocks.push({
      object: "block",
      type: "file",
      file: {
        type: "file_upload",
        file_upload: {
          id: fileUploadId,
        },
        caption: [
          {
            type: "text",
            text: {
              content: `${fileInfo.name} (${fileInfo.mimetype})`,
            },
          },
        ],
        name: fileInfo.name,
      },
    });

    return blocks;
  }

  if (fileInfo.mimetype.startsWith("image/")) {
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: {
          emoji: "🖼️",
        },
        rich_text: [
          {
            type: "text",
            text: {
              content: `Image: ${fileInfo.name} (${formatFileSize(fileInfo.size)})\n\nFile upload failed. The image was downloaded from Slack but could not be uploaded to Notion.`,
            },
          },
        ],
      },
    });
  } else if (
    (fileInfo.mimetype.startsWith("text/") ||
      fileInfo.mimetype === "application/json" ||
      fileInfo.mimetype === "application/javascript" ||
      fileInfo.mimetype === "application/xml") &&
    fileInfo.size < 50_000
  ) {
    const content = fileInfo.buffer.toString("utf8");
    const truncated = content.length > 2000;

    blocks.push({
      object: "block",
      type: "code",
      code: {
        rich_text: [
          {
            type: "text",
            text: {
              content: truncated
                ? `${content.substring(0, 2000)}\n\n... (truncated)`
                : content,
            },
          },
        ],
        language: getLanguageFromMimetype(fileInfo.mimetype, fileInfo.name),
      },
    });

    if (truncated) {
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: {
            emoji: "✂️",
          },
          rich_text: [
            {
              type: "text",
              text: {
                content: "File content truncated. Full file available in Slack.",
              },
            },
          ],
        },
      });
    }
  } else if (
    fileInfo.mimetype === "application/pdf" ||
    fileInfo.mimetype.includes("document") ||
    fileInfo.mimetype.includes("spreadsheet") ||
    fileInfo.mimetype.includes("presentation")
  ) {
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: {
          emoji: "📄",
        },
        rich_text: [
          {
            type: "text",
            text: {
              content: `Document: ${fileInfo.name}\n\nThis ${fileInfo.mimetype.split("/")[1].toUpperCase()} file has been downloaded from Slack. View the original in Slack for full access.`,
            },
          },
        ],
      },
    });
  } else {
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: {
          emoji: "📎",
        },
        rich_text: [
          {
            type: "text",
            text: {
              content: `File: ${fileInfo.name}\n\nBinary file downloaded from Slack.`,
            },
          },
        ],
      },
    });
  }

  blocks.push({
    object: "block",
    type: "table",
    table: {
      table_width: 2,
      has_column_header: false,
      has_row_header: false,
      children: [
        {
          object: "block",
          type: "table_row",
          table_row: {
            cells: [
              [
                {
                  type: "text",
                  text: { content: "File Name" },
                  annotations: { bold: true },
                },
              ],
              [
                {
                  type: "text",
                  text: { content: fileInfo.name },
                },
              ],
            ],
          },
        },
        {
          object: "block",
          type: "table_row",
          table_row: {
            cells: [
              [
                {
                  type: "text",
                  text: { content: "Type" },
                  annotations: { bold: true },
                },
              ],
              [
                {
                  type: "text",
                  text: { content: fileInfo.mimetype },
                },
              ],
            ],
          },
        },
        {
          object: "block",
          type: "table_row",
          table_row: {
            cells: [
              [
                {
                  type: "text",
                  text: { content: "Size" },
                  annotations: { bold: true },
                },
              ],
              [
                {
                  type: "text",
                  text: { content: formatFileSize(fileInfo.size) },
                },
              ],
            ],
          },
        },
      ],
    },
  });

  return blocks;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getLanguageFromMimetype(
  mimetype: string,
  filename: string
): string {
  const extensionMap: { [key: string]: string } = {
    ".js": "javascript",
    ".ts": "typescript",
    ".py": "python",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "c#",
    ".php": "php",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".r": "r",
    ".m": "matlab",
    ".sql": "sql",
    ".sh": "bash",
    ".ps1": "powershell",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".xml": "xml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".md": "markdown",
  };

  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return extensionMap[ext] || "plain text";
}
