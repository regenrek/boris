# Slack-Notion Task Bot

A serverless bot that creates Notion tasks from Slack messages using the Mastra framework.

## Features

- Create tasks in Notion directly from Slack using `/task` command or by mentioning the bot
- AI-powered parsing of task details from natural language
- Conversation context awareness - reads previous messages when mentioned
- Intelligent extraction of title, description, priority, due date, and assignee
- Automatic mapping of Slack users to Notion users
- Smart assignee detection - mentions in message or defaults to sender
- Support for relative dates (tomorrow, next week, etc.)
- Visual feedback with reactions (⏳ processing, ✅ success, ❌ error)
- Thread support - responds in the same thread when mentioned
- Direct message support for private task creation
- Lightweight API deployed on Vercel

## Detailed Setup Guide

### Step 1: Slack App Configuration

1. **Create a Slack App**

   - Go to https://api.slack.com/apps
   - Click "Create New App" → "From scratch"
   - Name your app (e.g., "Notion Task Bot")
   - Choose your workspace

2. **Configure OAuth & Permissions**

   - In the left sidebar, go to "OAuth & Permissions"
   - Scroll to "Scopes" → "Bot Token Scopes"
   - Add these scopes:
     - `channels:history` - View messages in public channels
     - `channels:read` - View basic channel info
     - `chat:write` - Send messages as bot
     - `commands` - Add slash commands
     - `groups:history` - View messages in private channels
     - `groups:read` - View basic private channel info
     - `im:history` - View direct messages
     - `im:read` - View basic DM info
     - `mpim:history` - View group DM messages
     - `mpim:read` - View basic group DM info
     - `users:read` - View user info
     - `app_mentions:read` - View messages that mention your app

3. **Install App to Workspace**

   - At the top of "OAuth & Permissions", click "Install to Workspace"
   - Authorize the permissions
   - Copy the **Bot User OAuth Token** (starts with `xoxb-`)
   - Save this as `SLACK_BOT_TOKEN`

4. **Get Signing Secret**

   - Go to "Basic Information" in the sidebar
   - Under "App Credentials", find "Signing Secret"
   - Click "Show" and copy it
   - Save this as `SLACK_SIGNING_SECRET`

5. **Configure Event Subscriptions** (Do this after deploying)

   - Go to "Event Subscriptions" in the sidebar
   - Toggle "Enable Events" ON
   - For Request URL: `https://your-app.vercel.app/api/slack/events`
   - Under "Subscribe to bot events", add:
     - `app_mention` - When someone mentions your bot
     - `message.channels` - Messages in public channels
     - `message.groups` - Messages in private channels
     - `message.im` - Direct messages
   - Click "Save Changes"

6. **Create Slash Command**
   - Go to "Slash Commands" in the sidebar
   - Click "Create New Command"
   - Command: `/task`
   - Request URL: `https://your-app.vercel.app/api/slack/slash-command`
   - Short Description: "Create a task in Notion"
   - Usage Hint: "[task description]"
   - Click "Save"

### Step 2: Notion Integration Setup

1. **Create Notion Integration**

   - Go to https://www.notion.so/my-integrations
   - Click "+ New integration"
   - Give it a name (e.g., "Slack Task Bot")
   - Select the workspace
   - Under "Content Capabilities":
     - ✓ Read content
     - ✓ Update content
     - ✓ Insert content
   - Click "Submit"
   - Copy the "Internal Integration Token" (starts with `secret_`)
   - Save this as `NOTION_API_KEY`

2. **Create Notion Database**

   - In Notion, create a new page
   - Add a database (type `/database` and select "Database - Full page")
   - Name it (e.g., "Tasks from Slack")
   - Add these properties (exact names matter!):
     ```
     - Name (Title) - Default, don't change
     - Status (Status) with options:
       • To be analysed
       • Todo
       • Blocked
       • In Progress
       • QA
       • Ready to Deploy
       • Fertig
       • Archiviert
     - Priorität (Select) with options:
       • Quick ⚡
       • Immediate 🔥
       • Prio: 1st 🚀
       • 2nd Prio
       • 3rd Prio
       • Remember 💭
     - Do Date (Date)
     - Verantwortlich (People) - Will automatically map Slack users to Notion users
     
     Note: 
     - Task descriptions will be added as page content
     - The bot will try to match Slack users to Notion users by email or name
     - If no matching Notion user is found, assignee info will be added to page content
     ```

3. **Connect Integration to Database**

   - In your Notion database, click the "..." menu in the top right
   - Go to "Add connections"
   - Search for your integration name
   - Click "Connect"

4. **Get Database ID**
   - Open your database in Notion
   - Look at the URL: `https://www.notion.so/[workspace]/[database-id]?v=[view-id]`
   - Copy the database ID (32 characters, may include hyphens)
   - Example: `https://www.notion.so/myworkspace/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6?v=...`
   - The database ID is: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
   - Save this as `NOTION_DATABASE_ID`

### Step 3: Environment Configuration

1. **Create `.env` file**

   ```bash
   cp .env.example .env
   ```

2. **Add your credentials to `.env`**

   ```env
   # Slack Configuration
   SLACK_BOT_TOKEN=<your_slack_bot_token>
   SLACK_SIGNING_SECRET=<your_slack_signing_secret>

   # Notion Configuration
   NOTION_API_KEY=<your_notion_api_key>
   NOTION_DATABASE_ID=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

   # OpenAI Configuration
   OPENAI_API_KEY=<your_openai_api_key>

   # Database Configuration (optional, for persistence)
   DATABASE_URL=file:./mastra.db
   ```

## Installation & Development

```bash
# Clone the repository
git clone <your-repo-url>
cd slack-notion-task-bot

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run locally
pnpm dev

# Type check
pnpm typecheck

# Build
pnpm build
```

## Deployment to Vercel

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Import to Vercel**

   - Go to [vercel.com](https://vercel.com)
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Configure your project:
     - **Framework Preset**: Other
     - **Root Directory**: `./` (leave as is)
     - **Build Command**: `pnpm build` or `npm run build`
     - **Output Directory**: `dist`
     - **Install Command**: `pnpm install` or `npm install`

3. **Add Environment Variables**
   On the same import screen, expand "Environment Variables":

   - Add each variable one by one:

   | Name                   | Value                         |
   | ---------------------- | ----------------------------- |
   | `SLACK_BOT_TOKEN`      | `<your_slack_bot_token>`         |
   | `SLACK_SIGNING_SECRET` | `<your_slack_signing_secret>`         |
   | `NOTION_API_KEY`       | `<your_notion_api_key>`      |
   | `NOTION_DATABASE_ID`   | `your-database-id`            |
   | `OPENAI_API_KEY`       | `<your_openai_api_key>`     |
   | `DATABASE_URL`         | `file:./mastra.db` (optional) |

4. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Copy your deployment URL (e.g., `https://your-app-name.vercel.app`)

### Option 2: Deploy via CLI

1. **Install Vercel CLI**

   ```bash
   npm i -g vercel
   ```

2. **Deploy**

   ```bash
   vercel
   ```

   - Follow the prompts:
     - Set up and deploy: `Y`
     - Which scope: Select your account
     - Link to existing project: `N`
     - Project name: `your-app-name`
     - Directory: `./`
     - Override settings: `N`

3. **Set Environment Variables**

   ```bash
   # Set each variable
   vercel env add SLACK_BOT_TOKEN
   vercel env add SLACK_SIGNING_SECRET
   vercel env add NOTION_API_KEY
   vercel env add NOTION_DATABASE_ID
   vercel env add OPENAI_API_KEY
   vercel env add DATABASE_URL
   ```

   - Enter the value when prompted
   - Select all environments (Production, Preview, Development)

4. **Deploy to Production**
   ```bash
   vercel --prod
   ```

### Post-Deployment Setup

1. **Get Your URLs**
   Your API endpoints will be:

   - Events: `https://your-app-name.vercel.app/api/slack/events`
   - Slash Command: `https://your-app-name.vercel.app/api/slack/slash-command`

2. **Update Slack App Configuration**

   **For Event Subscriptions:**

   - Go to your [Slack App Dashboard](https://api.slack.com/apps)
   - Select your app → "Event Subscriptions"
   - Enable Events: ON
   - Request URL: `https://your-app-name.vercel.app/api/slack/events`
   - Wait for "Verified" ✓
   - Save Changes

   **For Slash Commands:**

   - Go to "Slash Commands"
   - Edit the `/task` command
   - Request URL: `https://your-app-name.vercel.app/api/slack/slash-command`
   - Save

3. **Test Your Bot**
   - Go to Slack
   - Try: `/task Test task from Vercel`
   - Check your Notion database

### Managing Your Deployment

**View Logs:**

- Dashboard: Vercel Dashboard → Your Project → Functions → Logs
- CLI: `vercel logs`

**Update Environment Variables:**

- Dashboard: Settings → Environment Variables → Edit
- CLI: `vercel env rm VARIABLE_NAME` then `vercel env add VARIABLE_NAME`

**Redeploy After Changes:**

```bash
git add .
git commit -m "Update changes"
git push origin main
```

Vercel automatically redeploys on push to main branch

**Custom Domain (Optional):**

- Go to Settings → Domains
- Add your domain
- Update Slack URLs to use your custom domain

## Usage Examples

### Slash Command

#### Basic Task

```
/task Update documentation
```

Creates a task with:

- Title: "Update documentation"
- Status: "Todo"
- Priority: "3rd Prio"

### Bot Mentions

#### Simple Mention
```
@TaskBot Can you create a task to fix the login bug?
```

The bot will:
- React with ⏳ while processing
- Create a task titled "Fix the login bug"
- React with ✅ and reply with the Notion link

#### Mention in Conversation
```
User1: We're having issues with the payment system
User2: Yes, customers can't complete checkout
User1: This is urgent!
User1: @TaskBot please create a task for this
```

The bot will:
- Read the previous messages for context
- Create a task with:
  - Title: "Fix payment system checkout issues"
  - Description: Including context from the conversation
  - Priority: "Prio: 1st 🚀" (detected "urgent")
  - Reply in thread with the task link

#### Mention with Assignment
```
@TaskBot Create a task for @sarah to review the new API documentation by Friday
```

The bot will:
- Find Sarah in Notion users
- Create a task assigned to Sarah
- Set due date to Friday

### Task with Description

```
/task Fix login bug
Users are unable to login with Google OAuth
Check the callback URL configuration
```

Creates a task with:

- Title: "Fix login bug"
- Description: "Users are unable to login with Google OAuth\nCheck the callback URL configuration"

### High Priority Task

```
/task Production server is down urgent
Need to investigate immediately
```

Creates a task with:

- Title: "Production server is down urgent"
- Priority: "Prio: 1st 🚀" (detected from "urgent")

### Task with Due Date

```
/task Prepare monthly report
Due 2024-12-31
Include sales metrics and projections
```

Creates a task with:

- Title: "Prepare monthly report"
- Due Date: December 31, 2024
- Description: "Include sales metrics and projections"

### AI-Parsed Examples

#### Natural Language with Relative Date
```
/task Review the new design proposals by tomorrow, it's urgent!
```

AI extracts:
- Title: "Review the new design proposals"
- Priority: "Prio: 1st 🚀" (detected "urgent")
- Due Date: Tomorrow's date in YYYY-MM-DD format
- Assignee: The user who sent the command

#### Task with Mention
```
/task <@U12345> please update the API documentation with the new endpoints
Should be done by next Monday
```

AI extracts:
- Title: "Update the API documentation with the new endpoints"
- Assignee: U12345 (mentioned user)
- Due Date: Next Monday's date in YYYY-MM-DD format

#### Complex Natural Language
```
/task Quick fix needed: The login button is broken on mobile devices. 
Sarah from QA found this issue. High priority!
Due by end of week.
```

AI extracts:
- Title: "Fix broken login button on mobile devices"
- Description: "Sarah from QA found this issue"
- Priority: "Prio: 1st 🚀" (detected "high priority")
- Due Date: End of week in YYYY-MM-DD format

## Troubleshooting

### Slack Issues

1. **"Request URL didn't respond with valid JSON"**

   - Check your Vercel deployment logs
   - Ensure environment variables are set correctly
   - Verify the URL is correct (includes `/api/slack/events`)

2. **Bot doesn't respond to messages**

   - Ensure bot is in the channel (invite with `/invite @YourBotName`)
   - Check OAuth scopes are correctly configured
   - Verify event subscriptions are enabled

3. **"Invalid signature" errors**
   - Double-check `SLACK_SIGNING_SECRET` is correct
   - Ensure no extra spaces or newlines in the secret

### Notion Issues

1. **"Failed to create task in Notion"**

   - Verify the integration is connected to your database
   - Check that property names match exactly (case-sensitive)
   - Ensure `NOTION_DATABASE_ID` is correct

2. **Tasks created but missing data**
   - Verify database properties exist with exact names
   - Check Select options match exactly as defined in the database

### General Debugging

1. **Check Vercel Logs**

   ```bash
   vercel logs
   ```

2. **Test Locally**

   ```bash
   # Run with debug logging
   MASTRA_LOG_LEVEL=debug pnpm dev
   ```

3. **Verify Environment Variables**
   - In Vercel: Dashboard → Settings → Environment Variables
   - Locally: Check `.env` file has no typos

## Project Structure

```
src/
├── index.ts                          # H3 server and API routes
├── mastra/
│   ├── index.ts                     # Mastra configuration
│   ├── integrations/
│   │   └── notion.ts                # Notion API client
│   ├── tools/
│   │   └── create-notion-task.ts    # Notion task creation tool
│   └── workflows/
│       └── slack-to-notion-workflow.ts  # Main workflow logic
api/
└── index.ts                         # Vercel serverless function entry
```

## Security Considerations

- Never commit `.env` files to version control
- Use Vercel environment variables for production
- Slack signing secret validates all incoming requests
- Notion integration has minimal required permissions
- No user data is stored unless DATABASE_URL is configured

## License

ISC
