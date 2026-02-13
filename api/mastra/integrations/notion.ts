import { Client } from "@notionhq/client";
import {
  createFileNotionBlocks,
  downloadSlackFile,
  uploadFileToNotion,
} from "../utils/file-handler.js";
import { fetchJsonWithRetry } from "../../utils/http.js";

type NotionUser = {
  id: string;
  type: string;
  name?: string | null;
  person?: {
    email?: string | null;
  };
};

type NotionProject = {
  id: string;
  name: string;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const USERS_CACHE_TTL_MS = 60_000;
const PROJECTS_CACHE_TTL_MS = 60_000;
const NOTION_USER_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SLACK_USER_ID_PATTERN = /^U[A-Z0-9]{8,}$/i;

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSlackUserId(assignee: string): string | null {
  const trimmed = assignee.trim();
  const mentionMatch = trimmed.match(/^<@(U[A-Z0-9]+)>$/i);
  const maybeSlackId = mentionMatch?.[1] || trimmed;

  return SLACK_USER_ID_PATTERN.test(maybeSlackId)
    ? maybeSlackId.toUpperCase()
    : null;
}

export class NotionService {
  private client: Client;
  private usersCache: CacheEntry<NotionUser[]> | null = null;
  private projectsCache: CacheEntry<NotionProject[]> | null = null;

  constructor(client?: Client) {
    this.client =
      client ||
      new Client({
        auth: process.env.NOTION_API_KEY,
      });
  }

  private readCache<T>(cache: CacheEntry<T> | null): T | null {
    if (!cache) {
      return null;
    }

    if (cache.expiresAt <= Date.now()) {
      return null;
    }

    return cache.value;
  }

  private setUsersCache(users: NotionUser[]): void {
    this.usersCache = {
      value: users,
      expiresAt: Date.now() + USERS_CACHE_TTL_MS,
    };
  }

  private setProjectsCache(projects: NotionProject[]): void {
    this.projectsCache = {
      value: projects,
      expiresAt: Date.now() + PROJECTS_CACHE_TTL_MS,
    };
  }

  private getConfiguredDefaultProjectName(): string | undefined {
    const value = process.env.NOTION_DEFAULT_PROJECT_NAME?.trim();
    return value ? value : undefined;
  }

  async getUsers(forceRefresh = false): Promise<NotionUser[]> {
    const cachedUsers = !forceRefresh ? this.readCache(this.usersCache) : null;
    if (cachedUsers) {
      return cachedUsers;
    }

    try {
      const response = await this.client.users.list({});
      const users = response.results as NotionUser[];
      this.setUsersCache(users);
      return users;
    } catch (error) {
      console.error("Error fetching Notion users:", error);
      return [];
    }
  }

  async findUserByEmail(
    email: string,
    users?: NotionUser[]
  ): Promise<NotionUser | undefined> {
    const sourceUsers = users || (await this.getUsers());
    const normalizedEmail = normalizeValue(email);

    return sourceUsers.find(
      (user) =>
        user.type === "person" &&
        user.person?.email &&
        normalizeValue(user.person.email) === normalizedEmail
    );
  }

  async findUserByName(
    name: string,
    users?: NotionUser[]
  ): Promise<NotionUser | undefined> {
    const sourceUsers = users || (await this.getUsers());
    const normalizedName = normalizeValue(name);

    return sourceUsers.find(
      (user) =>
        user.type === "person" &&
        typeof user.name === "string" &&
        normalizeValue(user.name).includes(normalizedName)
    );
  }

  async getProjects(forceRefresh = false): Promise<NotionProject[]> {
    const projectsDatabaseId = process.env.NOTION_PROJECTS_DATABASE_ID;
    if (!projectsDatabaseId) {
      return [];
    }

    const cachedProjects = !forceRefresh
      ? this.readCache(this.projectsCache)
      : null;
    if (cachedProjects) {
      return cachedProjects;
    }

    try {
      const response = await this.client.dataSources.query({
        data_source_id: projectsDatabaseId,
        page_size: 100,
        sorts: [
          {
            property: "Name",
            direction: "ascending",
          },
        ],
      });

      const projects = response.results.map((page: any) => ({
        id: page.id,
        name:
          page.properties?.Name?.title?.[0]?.text?.content ||
          page.properties?.title?.title?.[0]?.text?.content ||
          page.properties?.Titel?.title?.[0]?.text?.content ||
          "Unnamed Project",
      }));

      this.setProjectsCache(projects);
      return projects;
    } catch (error) {
      console.error("Error fetching Notion projects:", error);
      return [];
    }
  }

  async findProjectByName(
    name: string,
    projects?: NotionProject[]
  ): Promise<NotionProject | undefined> {
    const sourceProjects = projects || (await this.getProjects());
    const normalizedName = normalizeValue(name);

    return sourceProjects.find(
      (project) => normalizeValue(project.name) === normalizedName
    );
  }

  async getDefaultProject(
    projects?: NotionProject[]
  ): Promise<NotionProject | undefined> {
    const configuredDefaultProjectName = this.getConfiguredDefaultProjectName();
    if (!configuredDefaultProjectName) {
      return undefined;
    }

    return this.findProjectByName(configuredDefaultProjectName, projects);
  }

  async getSlackUserInfo(
    slackUserId: string
  ): Promise<{ email?: string; name?: string }> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      return {};
    }

    try {
      const { response, data } = await fetchJsonWithRetry<any>(
        `https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`,
        {
          headers: {
            Authorization: `Bearer ${slackToken}`,
            "Content-Type": "application/json",
          },
        },
        {
          timeoutMs: 8_000,
          retries: 2,
        }
      );

      if (!response.ok || !data?.ok || !data.user) {
        return {};
      }

      return {
        email: data.user.profile?.email,
        name: data.user.real_name || data.user.name,
      };
    } catch (error) {
      console.error(
        "Error fetching Slack user info:",
        error instanceof Error ? error.message : String(error)
      );
      return {};
    }
  }

  async createTask(data: {
    title: string;
    description?: string;
    priority?:
      | "Quick ⚡"
      | "Immediate 🔥"
      | "Prio: 1st 🚀"
      | "2nd Prio"
      | "3rd Prio"
      | "Remember 💭";
    dueDate?: string;
    assignee?: string;
    project?: string;
    status?:
      | "To be analysed"
      | "Todo"
      | "Blocked"
      | "In Progress"
      | "QA"
      | "Ready to Deploy"
      | "Fertig"
      | "Archiviert";
    files?: any[];
  }) {
    const databaseId = process.env.NOTION_DATABASE_ID;
    if (!databaseId) {
      throw new Error("NOTION_DATABASE_ID environment variable is not set");
    }

    const properties: any = {
      Name: {
        title: [
          {
            text: {
              content: data.title,
            },
          },
        ],
      },
      Status: {
        status: {
          name: data.status || "Todo",
        },
      },
      Priorität: {
        select: {
          name: data.priority || "3rd Prio",
        },
      },
    };

    if (data.dueDate) {
      properties["Do Date"] = {
        date: {
          start: data.dueDate,
        },
      };
    }

    const requestedProjectName = data.project?.trim();
    const configuredDefaultProjectName = this.getConfiguredDefaultProjectName();

    if (requestedProjectName || configuredDefaultProjectName) {
      const projects = await this.getProjects();
      const project = requestedProjectName
        ? await this.findProjectByName(requestedProjectName, projects)
        : await this.getDefaultProject(projects);

      if (project) {
        properties["Projekt"] = {
          relation: [{ id: project.id }],
        };
      } else if (requestedProjectName) {
        console.warn(
          `Project "${requestedProjectName}" not found in Notion. Creating task without project.`
        );
      }
    }

    let unresolvedAssignee: string | undefined;

    if (data.assignee) {
      const assigneeValue = data.assignee.trim();

      if (NOTION_USER_ID_PATTERN.test(assigneeValue)) {
        properties.Verantwortlich = {
          people: [{ id: assigneeValue }],
        };
      } else {
        const users = await this.getUsers();
        let notionUser: NotionUser | undefined;

        const slackUserId = normalizeSlackUserId(assigneeValue);
        if (slackUserId) {
          const slackUserInfo = await this.getSlackUserInfo(slackUserId);

          if (slackUserInfo.email) {
            notionUser = await this.findUserByEmail(slackUserInfo.email, users);
          }

          if (!notionUser && slackUserInfo.name) {
            notionUser = await this.findUserByName(slackUserInfo.name, users);
          }
        } else if (assigneeValue.includes("@")) {
          notionUser = await this.findUserByEmail(assigneeValue, users);
        } else {
          notionUser = await this.findUserByName(assigneeValue, users);
        }

        if (notionUser) {
          properties.Verantwortlich = {
            people: [{ id: notionUser.id }],
          };
        } else {
          unresolvedAssignee = assigneeValue;
        }
      }
    }

    const children: any[] = [];

    if (data.description) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: data.description,
              },
            },
          ],
        },
      });
    }

    if (unresolvedAssignee) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `Assigned to: ${unresolvedAssignee} (unmapped user)`,
              },
            },
          ],
        },
      });
    }

    if (data.files && data.files.length > 0) {
      children.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "📎 Files from Slack",
              },
            },
          ],
        },
      });

      for (let index = 0; index < data.files.length; index += 1) {
        const file = data.files[index];
        const fileInfo = await downloadSlackFile(file);

        if (fileInfo) {
          const fileUploadId = await uploadFileToNotion(fileInfo);
          const fileBlocks = createFileNotionBlocks(fileInfo, fileUploadId);
          children.push(...fileBlocks);

          if (!fileUploadId) {
            children.push({
              object: "block",
              type: "callout",
              callout: {
                icon: {
                  emoji: "⚠️",
                },
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: `File "${fileInfo.name}" could not be uploaded to Notion. You can view it in Slack.`,
                    },
                  },
                ],
              },
            });

            if (file?.permalink_public || file?.url_private) {
              children.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: {
                        content: "View in Slack →",
                        link: {
                          url: file.permalink_public || file.url_private,
                        },
                      },
                    },
                  ],
                },
              });
            }
          }
        } else {
          children.push({
            object: "block",
            type: "callout",
            callout: {
              icon: {
                emoji: "❌",
              },
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: `Could not download file "${file?.name || "unknown file"}" from Slack.`,
                  },
                },
              ],
            },
          });
        }

        if (index < data.files.length - 1) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: " " },
                },
              ],
            },
          });
        }
      }
    }

    try {
      const response = await this.client.pages.create({
        parent: {
          database_id: databaseId,
        },
        properties,
        children: children.length > 0 ? children : undefined,
      });

      return {
        id: response.id,
        url: `https://www.notion.so/${response.id.replace(/-/g, "")}`,
        success: true,
      };
    } catch (error: any) {
      console.error("Failed to create Notion page:", error);
      throw new Error(error.message || "Failed to create task in Notion");
    }
  }
}
