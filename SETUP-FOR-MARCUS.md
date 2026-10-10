# Setup — cloud flow (do this before the first Claude Code session)

You will code in Claude Code on the web (claude.ai/code or the Claude app). The code lives on GitHub. Vercel builds every push and gives you a link to test on your iPhone. Nothing runs on your PC.

## 1. Notion integration
1. Go to notion.so/profile/integrations → New integration → Internal, workspace "Second Brain". Give it Read + Update content. Copy the token (starts with `ntn_`).
2. Open the `AI Reading List` database → `···` (top right) → Connections → add your new integration.
3. Database ID: `0c79d5a9ee16479881deb5a23142ebb5`

## 2. GitHub repo
1. Create a new **private** repo, e.g. `ai-reading-app`.
2. Upload these files to it: `SPEC.md`, `CLAUDE.md`, `.env.example`, `SETUP-FOR-MARCUS.md`. (Keep `KICKOFF-PROMPT.md` for yourself — you paste it, it doesn't need to be in the repo.)
3. Never upload a file with real secrets.

## 3. Vercel
1. vercel.com → Add New → Project → import the GitHub repo. It's fine if the first build fails (there's no app yet).
2. Project → Settings → Environment Variables → add, for **Production and Preview**:
   - `NOTION_TOKEN` = your token
   - `NOTION_DATABASE_ID` = `0c79d5a9ee16479881deb5a23142ebb5`
   - `APP_PASSWORD` = a long random password you choose (20 or more characters; the app slows down guessing but a long password is the real protection)
3. From now on, every push gets a preview link. Merging to `main` updates the real app.

## 4. Claude Code cloud environment
In claude.ai/code, create or edit the environment for this repo:
1. **Environment variables:** add the same three values as in Vercel. (The exact menu name may differ — look for environment / env vars settings.)
2. **Network access:** allow `api.notion.com` (custom allowlist), or choose full access. Without this, every Notion call fails.

## 5. Start
Open a new Claude Code session on the repo and paste `KICKOFF-PROMPT.md`.
When the app is live, come back to the Project chat and write: "App deployed at <url>".
