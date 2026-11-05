# Repository Instructions

- Do not use subagents or delegate tasks to other agents. Perform all work directly in the primary agent session.
- Use `/Users/parker/Projects/koko-backend-gold` for all FreeReader backend work; do not use `koko-backend`.
- Deploy `koko-backend-gold` by committing and pushing changes, not with the Railway CLI.
- The OCR worker is not configured for GitHub deployment; deploying it with the Railway CLI is allowed.

## Frontend deployment checks

- `main` normally deploys to Vercel project `flexytech/freereader-frontend` (`www.freereader.io`). The Vercel CLI is authenticated; use `--scope flexytech`.
- After pushing, check `gh api repos/fatherGoose1/freereader-frontend/commits/<sha>/status --jq '{state,total_count,statuses}'` and `vercel list freereader-frontend --scope flexytech`. Check the live alias with `vercel inspect https://www.freereader.io --scope flexytech`.
- A push can reach GitHub without starting a Vercel build (no Vercel status or new deployment). Check the Git connection via `vercel api /v9/projects/freereader-frontend --scope flexytech --raw | jq '{link,gitProviderOptions}'`. GitHub's repo hooks list may be empty for the GitHub App integration; the installation endpoint requires app authentication.
- To deploy a missed push from the **committed Git SHA** without including uncommitted local files, use `jq -n --arg sha '<full-sha>' '{name:"freereader-frontend",project:"prj_C2ele0s1gqY73hGnki4HaYebx7wd",target:"production",gitSource:{type:"github",ref:"main",repoId:1356426519,sha:$sha}}' | vercel api /v13/deployments --scope flexytech -X POST --input -`. Verify the returned deployment reaches `READY` and `vercel inspect https://www.freereader.io --scope flexytech` points to it.
