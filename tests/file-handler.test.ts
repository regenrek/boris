import {
  createFileNotionBlocks,
  downloadSlackFile,
  formatFileSize,
  getLanguageFromMimetype,
  uploadFileToNotion,
} from "../api/mastra/utils/file-handler.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("file-handler", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.NOTION_API_KEY = "ntn_test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("downloads a Slack file when URL is available", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    );

    const result = await downloadSlackFile({
      name: "notes.txt",
      mimetype: "text/plain",
      url_private_download: "https://files.slack.com/files-pri/T1-F1/download/notes.txt",
    });

    expect(result).not.toBeNull();
    expect(result?.name).toBe("notes.txt");
    expect(result?.mimetype).toBe("text/plain");
    expect(result?.size).toBe(3);
  });

  it("returns null when Slack bot token is missing", async () => {
    delete process.env.SLACK_BOT_TOKEN;

    const result = await downloadSlackFile({
      name: "notes.txt",
      mimetype: "text/plain",
      url_private_download: "https://files.slack.com/files-pri/T1-F1/download/notes.txt",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when Slack file has no private URL", async () => {
    const result = await downloadSlackFile({
      name: "missing.txt",
      mimetype: "text/plain",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when Slack file URL host is not allowed", async () => {
    const result = await downloadSlackFile({
      name: "bad.txt",
      mimetype: "text/plain",
      url_private_download: "https://evil.example/bad.txt",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when Slack download fails", async () => {
    fetchMock.mockResolvedValue(new Response("Forbidden", { status: 403 }));

    const result = await downloadSlackFile({
      name: "secret.txt",
      mimetype: "text/plain",
      url_private: "https://files.slack.com/files-pri/T1-F1/secret.txt",
    });

    expect(result).toBeNull();
  });

  it("uploads file to Notion in two steps", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "upload_1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const uploadId = await uploadFileToNotion({
      buffer: Buffer.from("hello"),
      name: "hello.txt",
      mimetype: "text/plain",
      size: 5,
    });

    expect(uploadId).toBe("upload_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when Notion API key is missing", async () => {
    delete process.env.NOTION_API_KEY;

    const uploadId = await uploadFileToNotion({
      buffer: Buffer.from("hello"),
      name: "hello.txt",
      mimetype: "text/plain",
      size: 5,
    });

    expect(uploadId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when Notion upload create call fails", async () => {
    fetchMock.mockResolvedValue(new Response("error", { status: 500 }));

    const uploadId = await uploadFileToNotion({
      buffer: Buffer.from("hello"),
      name: "hello.txt",
      mimetype: "text/plain",
      size: 5,
    });

    expect(uploadId).toBeNull();
  });

  it("returns null when Notion upload send call fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "upload_1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(new Response("bad", { status: 400 }));

    const uploadId = await uploadFileToNotion({
      buffer: Buffer.from("hello"),
      name: "hello.txt",
      mimetype: "text/plain",
      size: 5,
    });

    expect(uploadId).toBeNull();
  });

  it("creates direct Notion image block when upload id exists", () => {
    const blocks = createFileNotionBlocks(
      {
        buffer: Buffer.from("img"),
        name: "image.png",
        mimetype: "image/png",
        size: 3,
      },
      "file_upload_123"
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("image");
  });

  it("creates direct Notion PDF block when upload id exists", () => {
    const blocks = createFileNotionBlocks(
      {
        buffer: Buffer.from("pdf"),
        name: "doc.pdf",
        mimetype: "application/pdf",
        size: 3,
      },
      "file_upload_456"
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("pdf");
  });

  it("creates fallback code and metadata blocks for text file when upload id is missing", () => {
    const longText = "x".repeat(2500);
    const blocks = createFileNotionBlocks(
      {
        buffer: Buffer.from(longText),
        name: "script.ts",
        mimetype: "text/plain",
        size: longText.length,
      },
      null
    );

    expect(blocks[0].type).toBe("code");
    expect(blocks[1].type).toBe("callout");
    expect(blocks[2].type).toBe("table");
  });

  it("creates fallback binary callout and metadata table", () => {
    const blocks = createFileNotionBlocks(
      {
        buffer: Buffer.from([0, 1, 2]),
        name: "archive.bin",
        mimetype: "application/octet-stream",
        size: 3,
      },
      null
    );

    expect(blocks[0].type).toBe("callout");
    expect(blocks[1].type).toBe("table");
  });

  it("formats file sizes correctly", () => {
    expect(formatFileSize(12)).toBe("12 B");
    expect(formatFileSize(2048)).toBe("2.00 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("maps filename extensions to Notion languages", () => {
    expect(getLanguageFromMimetype("text/plain", "index.ts")).toBe("typescript");
    expect(getLanguageFromMimetype("text/plain", "README.md")).toBe("markdown");
    expect(getLanguageFromMimetype("text/plain", "file.unknown")).toBe(
      "plain text"
    );
  });
});
