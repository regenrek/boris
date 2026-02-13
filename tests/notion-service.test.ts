import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileHandlerMocks = vi.hoisted(() => ({
  downloadSlackFile: vi.fn(),
  uploadFileToNotion: vi.fn(),
  createFileNotionBlocks: vi.fn(),
}));

vi.mock("../api/mastra/utils/file-handler.js", () => ({
  downloadSlackFile: fileHandlerMocks.downloadSlackFile,
  uploadFileToNotion: fileHandlerMocks.uploadFileToNotion,
  createFileNotionBlocks: fileHandlerMocks.createFileNotionBlocks,
}));

import { NotionService } from "../api/mastra/integrations/notion.js";

type MockClient = {
  users: { list: ReturnType<typeof vi.fn> };
  dataSources: { query: ReturnType<typeof vi.fn> };
  pages: { create: ReturnType<typeof vi.fn> };
};

function buildMockClient(): MockClient {
  return {
    users: { list: vi.fn() },
    dataSources: { query: vi.fn() },
    pages: { create: vi.fn() },
  };
}

describe("NotionService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.resetAllMocks();
    delete process.env.NOTION_PROJECTS_DATABASE_ID;
    delete process.env.NOTION_DEFAULT_PROJECT_NAME;
    process.env.NOTION_DATABASE_ID = "db_test_id";
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns users and can find by email and name", async () => {
    const client = buildMockClient();
    client.users.list.mockResolvedValue({
      results: [
        {
          id: "user-1",
          type: "person",
          name: "Jane Doe",
          person: { email: "jane@example.com" },
        },
      ],
    });

    const service = new NotionService(client as any);
    const users = await service.getUsers();
    const byEmail = await service.findUserByEmail("jane@example.com");
    const byName = await service.findUserByName("jane");

    expect(users).toHaveLength(1);
    expect(byEmail?.id).toBe("user-1");
    expect(byName?.id).toBe("user-1");
  });

  it("returns empty list if users call fails", async () => {
    const client = buildMockClient();
    client.users.list.mockRejectedValue(new Error("boom"));

    const service = new NotionService(client as any);
    const users = await service.getUsers();

    expect(users).toEqual([]);
  });

  it("returns no projects when projects database id is missing", async () => {
    const client = buildMockClient();
    const service = new NotionService(client as any);

    const projects = await service.getProjects();

    expect(projects).toEqual([]);
    expect(client.dataSources.query).not.toHaveBeenCalled();
  });

  it("loads projects from Notion data source", async () => {
    process.env.NOTION_PROJECTS_DATABASE_ID = "projects_ds";
    const client = buildMockClient();
    client.dataSources.query.mockResolvedValue({
      results: [
        {
          id: "project-1",
          properties: {
            Name: { title: [{ text: { content: "Website Redesign" } }] },
          },
        },
      ],
    });

    const service = new NotionService(client as any);
    const projects = await service.getProjects();

    expect(client.dataSources.query).toHaveBeenCalledWith(
      expect.objectContaining({ data_source_id: "projects_ds", page_size: 100 })
    );
    expect(projects).toEqual([
      { id: "project-1", name: "Website Redesign" },
    ]);
  });

  it("creates a task with relation and direct Notion assignee id", async () => {
    process.env.NOTION_PROJECTS_DATABASE_ID = "projects_ds";
    const client = buildMockClient();
    client.dataSources.query.mockResolvedValue({
      results: [
        {
          id: "project-1",
          properties: {
            Name: { title: [{ text: { content: "Website Redesign" } }] },
          },
        },
      ],
    });
    client.pages.create.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
    });

    const service = new NotionService(client as any);
    const result = await service.createTask({
      title: "Ship landing page",
      description: "Coordinate final copy and images.",
      priority: "Immediate 🔥",
      dueDate: "2026-03-01",
      assignee: "123e4567-e89b-12d3-a456-426614174001",
      project: "Website Redesign",
      status: "In Progress",
    });

    const pageCreateInput = client.pages.create.mock.calls[0][0];
    expect(pageCreateInput.parent.database_id).toBe("db_test_id");
    expect(pageCreateInput.properties.Status.status.name).toBe("In Progress");
    expect(pageCreateInput.properties.Priorität.select.name).toBe("Immediate 🔥");
    expect(pageCreateInput.properties["Do Date"].date.start).toBe("2026-03-01");
    expect(pageCreateInput.properties.Verantwortlich.people[0].id).toBe(
      "123e4567-e89b-12d3-a456-426614174001"
    );
    expect(pageCreateInput.properties.Projekt.relation[0].id).toBe("project-1");
    expect(result.success).toBe(true);
    expect(result.url).toContain("https://www.notion.so/");
  });

  it("maps Slack assignee to Notion person and includes uploaded file blocks", async () => {
    const client = buildMockClient();
    client.users.list.mockResolvedValue({
      results: [
        {
          id: "notion-user-1",
          type: "person",
          name: "Sarah Miller",
          person: { email: "sarah@example.com" },
        },
      ],
    });
    client.pages.create.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174002",
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          user: {
            real_name: "Sarah Miller",
            profile: { email: "sarah@example.com" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    fileHandlerMocks.downloadSlackFile.mockResolvedValue({
      buffer: Buffer.from("image"),
      name: "design.png",
      mimetype: "image/png",
      size: 5,
    });
    fileHandlerMocks.uploadFileToNotion.mockResolvedValue("upload-1");
    fileHandlerMocks.createFileNotionBlocks.mockReturnValue([
      {
        object: "block",
        type: "image",
        image: { type: "file_upload", file_upload: { id: "upload-1" } },
      },
    ]);

    const service = new NotionService(client as any);
    await service.createTask({
      title: "Review design",
      assignee: "<@U123456789>",
      files: [{ id: "file-1", name: "design.png", mimetype: "image/png" }],
    });

    const pageCreateInput = client.pages.create.mock.calls[0][0];
    expect(pageCreateInput.properties.Verantwortlich.people[0].id).toBe(
      "notion-user-1"
    );
    expect(client.users.list).toHaveBeenCalledTimes(1);
    expect(fileHandlerMocks.downloadSlackFile).toHaveBeenCalledTimes(1);
    expect(fileHandlerMocks.uploadFileToNotion).toHaveBeenCalledTimes(1);
    expect(fileHandlerMocks.createFileNotionBlocks).toHaveBeenCalledTimes(1);
    expect(pageCreateInput.children.some((block: any) => block.type === "image")).toBe(
      true
    );
  });

  it("adds fallback note when a file cannot be downloaded", async () => {
    const client = buildMockClient();
    client.pages.create.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174003",
    });
    fileHandlerMocks.downloadSlackFile.mockResolvedValue(null);

    const service = new NotionService(client as any);
    await service.createTask({
      title: "Investigate broken attachment",
      files: [{ id: "file-2", name: "broken.zip", mimetype: "application/zip" }],
    });

    const pageCreateInput = client.pages.create.mock.calls[0][0];
    const calloutBlock = pageCreateInput.children.find(
      (block: any) => block.type === "callout"
    );
    expect(calloutBlock).toBeDefined();
  });

  it("adds Slack link and spacing blocks when file upload fails for multiple files", async () => {
    const client = buildMockClient();
    client.pages.create.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174004",
    });
    fileHandlerMocks.downloadSlackFile
      .mockResolvedValueOnce({
        buffer: Buffer.from("a"),
        name: "first.txt",
        mimetype: "text/plain",
        size: 1,
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from("b"),
        name: "second.txt",
        mimetype: "text/plain",
        size: 1,
      });
    fileHandlerMocks.uploadFileToNotion
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("upload-2");
    fileHandlerMocks.createFileNotionBlocks
      .mockReturnValueOnce([{ object: "block", type: "code", code: {} }])
      .mockReturnValueOnce([{ object: "block", type: "file", file: {} }]);

    const service = new NotionService(client as any);
    await service.createTask({
      title: "Handle two files",
      files: [
        {
          id: "file-1",
          name: "first.txt",
          mimetype: "text/plain",
          permalink_public: "https://slack.example/file-1",
        },
        {
          id: "file-2",
          name: "second.txt",
          mimetype: "text/plain",
        },
      ],
    });

    const pageCreateInput = client.pages.create.mock.calls[0][0];
    const linkBlock = pageCreateInput.children.find(
      (block: any) =>
        block.type === "paragraph" &&
        block.paragraph?.rich_text?.[0]?.text?.content === "View in Slack →"
    );
    const spacingBlock = pageCreateInput.children.find(
      (block: any) =>
        block.type === "paragraph" &&
        block.paragraph?.rich_text?.[0]?.text?.content === " "
    );
    expect(linkBlock).toBeDefined();
    expect(spacingBlock).toBeDefined();
  });

  it("maps direct email assignee and adds fallback text when assignee is unknown", async () => {
    const client = buildMockClient();
    client.users.list.mockResolvedValue({
      results: [
        {
          id: "notion-user-2",
          type: "person",
          name: "Email User",
          person: { email: "email-user@example.com" },
        },
      ],
    });
    client.pages.create
      .mockResolvedValueOnce({
        id: "123e4567-e89b-12d3-a456-426614174005",
      })
      .mockResolvedValueOnce({
        id: "123e4567-e89b-12d3-a456-426614174006",
      });

    const service = new NotionService(client as any);
    await service.createTask({
      title: "Map by email",
      assignee: "email-user@example.com",
    });
    await service.createTask({
      title: "Unknown assignee",
      assignee: "unknown-person",
    });

    const firstCall = client.pages.create.mock.calls[0][0];
    const secondCall = client.pages.create.mock.calls[1][0];
    expect(firstCall.properties.Verantwortlich.people[0].id).toBe("notion-user-2");
    expect(
      secondCall.children.some((block: any) =>
        String(block.paragraph?.rich_text?.[0]?.text?.content || "").includes(
          "Assigned to: unknown-person (unmapped user)"
        )
      )
    ).toBe(true);
  });

  it("returns empty projects when project query fails", async () => {
    process.env.NOTION_PROJECTS_DATABASE_ID = "projects_ds";
    const client = buildMockClient();
    client.dataSources.query.mockRejectedValue(new Error("notion down"));

    const service = new NotionService(client as any);
    const projects = await service.getProjects();

    expect(projects).toEqual([]);
  });

  it("handles Slack lookup fallback when response is not ok", async () => {
    const client = buildMockClient();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const service = new NotionService(client as any);
    const slackInfo = await service.getSlackUserInfo("U_NOT_FOUND");

    expect(slackInfo).toEqual({});
  });

  it("uses configured default project when no explicit project is provided", async () => {
    process.env.NOTION_PROJECTS_DATABASE_ID = "projects_ds";
    process.env.NOTION_DEFAULT_PROJECT_NAME = "Website Redesign";

    const client = buildMockClient();
    client.dataSources.query.mockResolvedValue({
      results: [
        {
          id: "project-1",
          properties: {
            Name: { title: [{ text: { content: "Website Redesign" } }] },
          },
        },
      ],
    });
    client.pages.create.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174007",
    });

    const service = new NotionService(client as any);
    await service.createTask({
      title: "Default project task",
    });

    const pageCreateInput = client.pages.create.mock.calls[0][0];
    expect(pageCreateInput.properties.Projekt.relation[0].id).toBe("project-1");
  });

  it("does not query projects when no explicit or configured default project exists", async () => {
    const client = buildMockClient();
    client.pages.create.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174008",
    });

    const service = new NotionService(client as any);
    await service.createTask({
      title: "No project task",
    });

    expect(client.dataSources.query).not.toHaveBeenCalled();
  });

  it("throws a normalized error when page creation fails", async () => {
    const client = buildMockClient();
    client.pages.create.mockRejectedValue(new Error("create failed"));

    const service = new NotionService(client as any);
    await expect(
      service.createTask({
        title: "Failure case",
      })
    ).rejects.toThrow("create failed");
  });
});
