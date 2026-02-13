# Notion Setup

This guide sets up Notion so Boris can create tasks.

## 1. Create Integration

1. Go to `https://www.notion.so/my-integrations`
2. Click `New integration`
3. Name it (for example `Boris`)
4. Select workspace
5. Enable capabilities:
   - Read content
   - Update content
   - Insert content
6. Save and copy internal integration token

Token format:

- New tokens usually start with `ntn_`
- Older tokens may start with `secret_`

Store as:

- `NOTION_API_KEY`

## 2. Create Task Database

Create a full-page database in Notion.

Important: Boris expects these property names exactly in the current implementation.

- `Name` (Title)
- `Status` (Status)
- `Priorität` (Select)
- `Do Date` (Date)
- `Verantwortlich` (People)
- `Projekt` (Relation, optional)

Recommended default options:

- `Status`: `Todo`, `In Progress`, `Blocked`, `Done`
- `Priorität`: `Quick ⚡`, `Immediate 🔥`, `Prio: 1st 🚀`, `2nd Prio`, `3rd Prio`, `Remember 💭`

Note:

- If your property naming differs, align the code in `api/mastra/integrations/notion.ts`.

## 3. Connect Integration

In your task database page:

1. Open `...` menu
2. `Add connections`
3. Select your Boris integration

## 4. Get Database ID

From database URL:

`https://www.notion.so/<workspace>/<database-id>?v=<view-id>`

Store as:

- `NOTION_DATABASE_ID=<database-id>`

## 5. Optional Projects Database

If you want project relation mapping:

1. Create a projects database
2. Add relation from task database to projects database (`Projekt`)
3. Set:

`NOTION_PROJECTS_DATABASE_ID=<projects_database_id>`

If this is not set, Boris still creates tasks without project relation.

## Validation

- Integration can access task database
- `NOTION_DATABASE_ID` is correct
- Creating a task from Slack inserts a row into Notion
