export interface SlackFileInfo {
  buffer: Buffer;
  name: string;
  mimetype: string;
  size: number;
}

export async function downloadSlackFile(file: any): Promise<SlackFileInfo | null> {
  try {
    console.log("Downloading Slack file:", {
      name: file.name,
      mimetype: file.mimetype,
      url_private: file.url_private,
      url_private_download: file.url_private_download,
      permalink_public: file.permalink_public
    });
    
    if (!file.url_private_download && !file.url_private) {
      console.error("No download URL available for file:", file.name);
      return null;
    }
    
    const downloadUrl = file.url_private_download || file.url_private;
    console.log(`Using download URL: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to download file ${file.name}: ${response.statusText}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`Successfully downloaded file: ${file.name}, size: ${buffer.length} bytes`);
    
    return {
      buffer,
      name: file.name || 'untitled',
      mimetype: file.mimetype || 'application/octet-stream',
      size: buffer.length
    };
  } catch (error) {
    console.error("Error downloading Slack file:", error);
    return null;
  }
}

export async function uploadFileToNotion(fileInfo: SlackFileInfo): Promise<string | null> {
  try {
    console.log("Starting Notion file upload for:", {
      name: fileInfo.name,
      mimetype: fileInfo.mimetype,
      size: fileInfo.size
    });
    
    // Step 1: Create a file upload
    const createPayload = {
      filename: fileInfo.name,
      content_type: fileInfo.mimetype,
    };
    console.log("Creating file upload with payload:", createPayload);
    
    const createResponse = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(createPayload),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Failed to create file upload:', errorText);
      return null;
    }

    const fileUpload = await createResponse.json() as { id: string };
    const fileUploadId = fileUpload.id;
    console.log("Created file upload with ID:", fileUploadId);

    // Step 2: Send the file content
    // Create FormData with the file
    const formData = new FormData();
    const blob = new Blob([fileInfo.buffer], { type: fileInfo.mimetype });
    formData.append('file', blob, fileInfo.name);

    console.log(`Sending file content to: https://api.notion.com/v1/file_uploads/${fileUploadId}/send`);
    
    const sendResponse = await fetch(`https://api.notion.com/v1/file_uploads/${fileUploadId}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
      },
      body: formData,
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Failed to send file:', errorText);
      return null;
    }

    console.log("Successfully uploaded file to Notion with ID:", fileUploadId);
    
    // Return the file upload ID which can be used to reference the file in Notion blocks
    return fileUploadId;
  } catch (error) {
    console.error('Error uploading file to Notion:', error);
    return null;
  }
}

export function createFileNotionBlocks(fileInfo: SlackFileInfo, fileUploadId: string | null): any[] {
  const blocks: any[] = [];
  
  console.log("Creating Notion blocks for file:", {
    name: fileInfo.name,
    mimetype: fileInfo.mimetype,
    fileUploadId: fileUploadId
  });
  
  // If file was successfully uploaded to Notion
  if (fileUploadId) {
    // For images, create an image block
    if (fileInfo.mimetype.startsWith('image/')) {
      const imageBlock = {
        object: "block",
        type: "image",
        image: {
          type: "file_upload",
          file_upload: {
            id: fileUploadId
          }
        }
      };
      console.log("Creating image block:", JSON.stringify(imageBlock, null, 2));
      blocks.push(imageBlock);
    }
    // For PDFs, create a PDF block
    else if (fileInfo.mimetype === 'application/pdf') {
      blocks.push({
        object: "block",
        type: "pdf",
        pdf: {
          type: "file_upload",
          file_upload: {
            id: fileUploadId
          },
          caption: [{
            type: "text",
            text: {
              content: fileInfo.name
            }
          }]
        }
      });
    }
    // For other files, create a file block
    else {
      blocks.push({
        object: "block",
        type: "file",
        file: {
          type: "file_upload",
          file_upload: {
            id: fileUploadId
          },
          caption: [{
            type: "text",
            text: {
              content: `${fileInfo.name} (${fileInfo.mimetype})`
            }
          }],
          name: fileInfo.name
        }
      });
    }
    
    return blocks;
  }
  
  // Fallback if upload failed
  if (fileInfo.mimetype.startsWith('image/')) {
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
  }
  // For small text/code files, include content directly
  else if ((fileInfo.mimetype.startsWith('text/') || 
            fileInfo.mimetype === 'application/json' ||
            fileInfo.mimetype === 'application/javascript' ||
            fileInfo.mimetype === 'application/xml') && 
            fileInfo.size < 50000) {
    const content = fileInfo.buffer.toString('utf8');
    const truncated = content.length > 2000;
    
    blocks.push({
      object: "block",
      type: "code",
      code: {
        rich_text: [{
          type: "text",
          text: {
            content: truncated ? content.substring(0, 2000) + '\n\n... (truncated)' : content
          }
        }],
        language: getLanguageFromMimetype(fileInfo.mimetype, fileInfo.name)
      }
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
  }
  // For PDFs and documents
  else if (fileInfo.mimetype === 'application/pdf' || 
           fileInfo.mimetype.includes('document') ||
           fileInfo.mimetype.includes('spreadsheet') ||
           fileInfo.mimetype.includes('presentation')) {
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
              content: `Document: ${fileInfo.name}\n\nThis ${fileInfo.mimetype.split('/')[1].toUpperCase()} file has been downloaded from Slack. View the original in Slack for full access.`,
            },
          },
        ],
      },
    });
  }
  // For other file types
  else {
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
  
  // Add file metadata table
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
              [{
                type: "text",
                text: { content: "File Name" },
                annotations: { bold: true }
              }],
              [{
                type: "text",
                text: { content: fileInfo.name }
              }]
            ]
          }
        },
        {
          object: "block",
          type: "table_row",
          table_row: {
            cells: [
              [{
                type: "text",
                text: { content: "Type" },
                annotations: { bold: true }
              }],
              [{
                type: "text",
                text: { content: fileInfo.mimetype }
              }]
            ]
          }
        },
        {
          object: "block",
          type: "table_row",
          table_row: {
            cells: [
              [{
                type: "text",
                text: { content: "Size" },
                annotations: { bold: true }
              }],
              [{
                type: "text",
                text: { content: formatFileSize(fileInfo.size) }
              }]
            ]
          }
        }
      ]
    }
  });
  
  return blocks;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getLanguageFromMimetype(mimetype: string, filename: string): string {
  // Map common mimetypes to Notion code block languages
  const extensionMap: { [key: string]: string } = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'c#',
    '.php': 'php',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.m': 'matlab',
    '.sql': 'sql',
    '.sh': 'bash',
    '.ps1': 'powershell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.md': 'markdown',
  };
  
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return extensionMap[ext] || 'plain text';
}