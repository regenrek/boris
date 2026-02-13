import { Client } from "@notionhq/client";
import { downloadSlackFile, createFileNotionBlocks, uploadFileToNotion } from "../utils/file-handler.js";

export class NotionService {
  private client: Client;

  constructor() {
    this.client = new Client({
      auth: process.env.NOTION_API_KEY,
    });
  }

  async getUsers() {
    try {
      const response = await this.client.users.list({});
      return response.results;
    } catch (error) {
      console.error("Error fetching Notion users:", error);
      return [];
    }
  }

  async findUserByEmail(email: string) {
    const users = await this.getUsers();
    return users.find(user => 
      user.type === "person" && 
      user.person?.email === email
    );
  }

  async findUserByName(name: string) {
    const users = await this.getUsers();
    return users.find(user => 
      user.type === "person" && 
      user.name?.toLowerCase().includes(name.toLowerCase())
    );
  }

  async getProjects() {
    try {
      const projectsDatabaseId = process.env.NOTION_PROJECTS_DATABASE_ID;
      
      if (!projectsDatabaseId) {
        console.error("NOTION_PROJECTS_DATABASE_ID environment variable not set");
        return [];
      }
      
      // Query the projects database
      const response = await this.client.databases.query({
        database_id: projectsDatabaseId,
        page_size: 100,
        sorts: [
          {
            property: "Name",
            direction: "ascending"
          }
        ]
      });
      
      // Extract project information
      const projects = response.results.map((page: any) => ({
        id: page.id,
        name: page.properties?.Name?.title?.[0]?.text?.content || 
              page.properties?.title?.title?.[0]?.text?.content || 
              page.properties?.Titel?.title?.[0]?.text?.content || 
              'Unnamed Project'
      }));
      
      console.log(`Found ${projects.length} projects from projects database`);
      return projects;
    } catch (error) {
      console.error("Error fetching Notion projects:", error);
      return [];
    }
  }

  async findProjectByName(name: string) {
    const projects = await this.getProjects();
    return projects.find((project: any) => 
      project.name.toLowerCase() === name.toLowerCase()
    );
  }

  async getDefaultProject() {
    const defaultProjectName = "Instructa.ai - Website, SEO & Design";
    let project = await this.findProjectByName(defaultProjectName);
    
    if (!project) {
      // If default project doesn't exist, log a warning
      console.warn(`Default project "${defaultProjectName}" not found in Notion. Tasks will be created without a project.`);
    }
    
    return project;
  }

  // Helper to get Slack user info and map to Notion user
  async getSlackUserInfo(slackUserId: string): Promise<{ email?: string; name?: string }> {
    try {
      const response = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      const data: any = await response.json();
      if (data.ok && data.user) {
        return {
          email: data.user.profile?.email,
          name: data.user.real_name || data.user.name,
        };
      }
    } catch (error) {
      console.error("Error fetching Slack user info:", error);
    }
    return {};
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
    const databaseId = process.env.NOTION_DATABASE_ID!;

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

    // Handle project relation
    if (data.project) {
      // Find the project by name
      let project = await this.findProjectByName(data.project);
      
      // If the specified project is not found and it's the default, try to get any available project
      if (!project && data.project === "Instructa.ai - Website, SEO & Design") {
        project = await this.getDefaultProject();
      }
      
      if (project) {
        properties["Projekt"] = {
          relation: [{ id: project.id }]
        };
      } else {
        console.warn(`Project "${data.project}" not found in Notion. Creating task without project.`);
      }
    }

    // Try to find the Notion user by name or email
    if (data.assignee) {
      let notionUser;
      
      // Check if assignee is already a Notion user ID (32 char hex string with dashes)
      if (data.assignee.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
        // It's already a Notion user ID, use it directly
        properties.Verantwortlich = {
          people: [{ id: data.assignee }]
        };
      } else if (data.assignee.startsWith("U") && data.assignee.length > 8) {
        // It's a Slack user ID
        const slackUserInfo = await this.getSlackUserInfo(data.assignee);
        
        // Try to find by email first
        if (slackUserInfo.email) {
          notionUser = await this.findUserByEmail(slackUserInfo.email);
        }
        
        // If not found by email, try by name
        if (!notionUser && slackUserInfo.name) {
          notionUser = await this.findUserByName(slackUserInfo.name);
        }
        
        if (notionUser) {
          properties.Verantwortlich = {
            people: [{ id: notionUser.id }]
          };
        }
      } else {
        // Direct email or name was provided
        if (data.assignee.includes("@")) {
          notionUser = await this.findUserByEmail(data.assignee);
        } else {
          notionUser = await this.findUserByName(data.assignee);
        }
        
        if (notionUser) {
          properties.Verantwortlich = {
            people: [{ id: notionUser.id }]
          };
        }
      }
    }

    // Create page content with description and assignee info
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
    
    // Only add assignee to content if we couldn't find them in Notion users
    if (data.assignee && !properties.Verantwortlich) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `Assigned to: ${data.assignee} (Slack user)`,
              },
            },
          ],
        },
      });
    }
    
    // Add file information if files were shared
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
      
      // Process each file
      for (const file of data.files) {
        console.log("Processing file from Slack:", file);
        
        // Download the file from Slack
        const fileInfo = await downloadSlackFile(file);
        
        if (fileInfo) {
          // Upload the file to Notion
          const fileUploadId = await uploadFileToNotion(fileInfo);
          
          // Create file blocks
          const fileBlocks = createFileNotionBlocks(fileInfo, fileUploadId);
          console.log("Adding file blocks to Notion page:", fileBlocks);
          children.push(...fileBlocks);
          
          // If upload failed, add fallback information
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
            
            // Add Slack link if available
            if (file.permalink_public || file.url_private) {
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
                          url: file.permalink_public || file.url_private
                        }
                      },
                    },
                  ],
                },
              });
            }
          }
        } else {
          // If download failed, add a note
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
                    content: `Could not download file "${file.name}" from Slack.`,
                  },
                },
              ],
            },
          });
        }
        
        // Add spacing between files (but not after the last one)
        if (data.files.indexOf(file) < data.files.length - 1) {
          children.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{
                type: "text",
                text: { content: " " }
              }]
            }
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
