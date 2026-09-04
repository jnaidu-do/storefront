---
name: app-platform
description: "Deploy this workspace to DigitalOcean App Platform and manage the app afterwards: push code to GitHub with GITHUB_TOKEN, create an app from a spec, watch the deployment, read logs, update the spec, add databases or domains, redeploy. IMPORTANT: any GitHub repo created for the app must be PUBLIC, never private — App Platform cannot deploy from private repos. Read when the user asks to deploy, ship, publish, go live, create an app, redeploy, debug or diagnose a failed deployment, or manage an existing app, database, or domain on App Platform — and before creating any GitHub repo for the app."
---

Every App Platform operation goes through the `do_actions_action_invoke` MCP tool with an exact tool name from the table below. Do NOT call `do_actions_action_search` to find them — search is unreliable with tool names and wastes time; the full inventory is right here. If a name fails with "unknown tool", only then search, with plain English (e.g. "get app logs"), never with toolbelt names or slug fragments.

## Tool inventory (invoke exactly as written)

| Purpose                     | tool                                      | arguments                                                                   |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ------ | ----------------------------------------------- |
| Create app                  | `digitalocean_apps-create-app-from-spec`  | `{"spec": { ...AppSpec... } }`                                              |
| Get app (live URL, status)  | `digitalocean_apps-get-info`              | `{"AppID": "<uuid>"}`                                                       |
| List apps                   | `digitalocean_apps-list`                  | `{"Page": 1, "PerPage": 50}`                                                |
| Update app / force redeploy | `digitalocean_apps-update`                | `{"update": {"app_id": "<uuid>", "request": {"spec": { ...AppSpec... } }}}` |
| Deployment status           | `digitalocean_apps-get-deployment-status` | `{"AppID": "<uuid>"}`                                                       |
| Logs                        | `digitalocean_apps-get-logs`              | `{"AppID": "<uuid>", "LogType": "BUILD                                      | DEPLOY | RUN", "Component": "<name>", "TailLines": 100}` |
| Delete app                  | `digitalocean_apps-delete`                | `{"AppID": "<uuid>"}` — confirm with the user first                         |

Mind the casing: `AppID` is PascalCase; `create`/`update` carry the AppSpec under `spec` / `request.spec`. Databases and domains are not separate tools — they are fields on the AppSpec (`spec.databases`, `spec.domains`), so adding one means an `apps-update` with the extended spec.

## OAuth connectlink: not an error

The user's first `digitalocean_*` call may return: `requires an OAuth connection ... Open https://cloud.digitalocean.com/security/connectlinks/confirm?token=... to authorize`. This is a one-time consent gate, not a failure. Reply to the user with the link verbatim, ask them to open it and confirm, then retry the exact same call once they say done. Never improvise around it.

## GitHub access

`GITHUB_TOKEN` is in the environment with repo scope on the user's GitHub account. Use it directly — never ask the user for a token.

**Hard rule: never create a GitHub repo, commit, push, force-push, or open a PR until the user explicitly says yes in this chat.** Propose the planned repo name, visibility, branch, and remote first; wait for approval; only then run git/GitHub writes. Reading remotes or `git status` is fine without approval.

**Visibility: always create the repo PUBLIC and keep it public.** Never create it private, and never toggle visibility back to private after deploying — App Platform's GitHub integration and deploy-on-push both depend on uninterrupted access, and a private repo silently breaks future deployments.

- Create a repo with the GitHub API: send a POST to `https://api.github.com/user/repos` with an Authorization header carrying the token as a Bearer credential, an `Accept: application/vnd.github+json` header, and a JSON body of `{"name": "<name>", "private": false}`. Do NOT use `gh repo create --private`.
- Push over HTTPS: init, add, commit, then set the origin remote to the repo's https URL with `x-access-token` as the username and the token as the password, and push `-u origin main`. Check `git config user.email`/`user.name`; set them to the account login if missing.
- The authenticated user: GET `https://api.github.com/user` with the same Authorization header — use its `login` for `<owner>`.

## Recipe: deploy this workspace

1. **Propose, then push only after approval.** Inspect the workspace, propose a public GitHub repo name, and that you will push the current tree. Wait for an explicit yes. Only then create the repo (public — see GitHub access above) and push. Never push without that confirmation.
2. **Pick the component kind.**
   - Plain HTML/CSS/JS, or a framework that builds to static files (Vite, CRA, Astro): a `static_sites` entry with `build_command` (omit it for plain HTML) and `output_dir` (`dist` for Vite, `build` for CRA, `.` for plain HTML). Add `routes: [{path: "/", index_document: index.html, error_document: index.html}]` for SPAs.
   - Anything with a server: a `services` entry with `build_command`, `run_command`, and `http_port`. The server must bind `0.0.0.0` and the port in `run_command` must equal `http_port`.
3. **Source: always `github:` with deploy-on-push.** Every component source must be `"github": {"repo": "<owner>/<repo>", "branch": "main", "deploy_on_push": true}` so every future push auto-deploys. Never use a generic `git:` source — it pins the commit at creation and silently rebuilds the same commit forever (see gotchas). If the create call fails with a GitHub integration / repository-access error (e.g. "GitHub user does not have access to <owner>/<repo>"), the DigitalOcean GitHub App isn't installed or doesn't cover this repo — repo visibility is irrelevant to this check, and the agent's GITHUB_TOKEN is unrelated to it. Guide the user precisely: if the app was never installed, surface the connectlink / Cloud UI → Apps → Connect GitHub; if it IS installed with a selected-repos scope (common when the repo is brand new), the user edits the existing installation — GitHub → Settings → Applications → Installed GitHub Apps → DigitalOcean App Platform → Configure → Repository access → add the repo → Save (https://github.com/settings/installations, or https://github.com/organizations/<org>/settings/installations). The grant is instant — retry the SAME github-source spec once they confirm. Only fall back to a generic `git:` source if the user explicitly declines the GitHub integration — and warn them that deploys will no longer track pushes.
4. **Wire the database into the spec, seed it automatically.** When the app needs a database: add it under `spec.databases` (e.g. `{"engine": "PG", "name": "db", "production": false, "version": "16"}` — dev DB unless the user asks for production), and reference the connection as a SECRET env on each component that needs it: `{"key": "DATABASE_URL", "scope": "RUN_TIME", "type": "SECRET", "value": "${db.DATABASE_URL}"}`. If the repo has an idempotent migration/seed script (e.g. `npm run db:init`), add a pre-deploy job so schema + seed run on every deploy with zero manual console steps: `jobs: [{"name": "db-init", "kind": "PRE_DEPLOY", "github": { ...same source... }, "run_command": "npm run db:init", "envs": [ ...same DATABASE_URL entry... ], "instance_size_slug": "basic-xxs"}]`. Never leave seeding as a manual console step for the user.
5. **Propose the app, then create only after approval.** Share the proposed app name, region, and component shape. Wait for yes. Then `digitalocean_apps-create-app-from-spec` with `{"spec": {"name": "<kebab-name>", "region": "nyc", ...}}`. For services add `"instance_size_slug": "basic-xxs", "instance_count": 1` unless the user says otherwise.
6. **Wait for ACTIVE.** Poll `digitalocean_apps-get-deployment-status` every ~30s. A real build takes 3-5 minutes. If it flips ACTIVE in seconds, the build was skipped — see gotcha below.
7. **Report the URL.** `digitalocean_apps-get-info` → `live_url` / `default_ingress`. Curl it; if it isn't 200, read `digitalocean_apps-get-logs` (`LogType: "BUILD"` then `"RUN"`) and fix forward.

## Recipe: debug a failed deployment

You are given: app name + id, deployment id, component, failed phase (BUILD / DEPLOY / RUN), region, and repo URL. **Pull the logs yourself with your tools — do not ask the user for log output.** Work the ladder in order; stop as soon as the root cause is proven.

**Hard gate: run `git clone` ONLY after the user says yes.** Never clone to inspect, gather evidence, or "in parallel" — not even as a read. Also do not fetch repository files via `webfetch` / raw HTTP URLs (e.g. `raw.githubusercontent.com`) until the user says yes. Diagnose from logs and spec first. After reporting the root cause, offer the clone (step 5); only run it after approval. Repo file reads without an explicit yes are a violation.

1. **Read the phase that failed.** `apps-get-logs` with the given AppID and Component:
   - BUILD failure → `LogType: "BUILD"`.
   - Deploy/runtime failure → `LogType: "DEPLOY"` then `"RUN"` (services only — static sites have no RUN logs; that call 400s for them).
2. **Check the spec.** `apps-get-info` → build/run commands, `http_port` vs the port in `run_command`, env vars, health check config. Most failures are config, not code.
3. **Match the failure family:**
   - `Missing script` / command not found → wrong `build_command` or `run_command` in the spec → spec fix.
   - Container starts then dies / health check fails → port mismatch (`run_command` port must equal `http_port`, server must bind `0.0.0.0`) or boot crash → spec fix, or code fix if the crash is in app code.
   - `ERR_MODULE_NOT_FOUND` / stack trace in app code → likely a code fix; cloning may be needed, but **do not clone yet** — report the cause and offer the clone (step 5).
   - Missing env var at boot → spec fix; credentials go in as `type: "SECRET"` env entries.
   - vite preview 403 "Blocked request. This host is not allowed." → add `preview: { allowedHosts: true }` to vite.config.js → code fix.
4. **Do NOT clone yet.** If the evidence points at application code, note that a clone would be needed and keep diagnosing from logs/spec. Also do not `webfetch` repository files until the user approves the offer in step 5. Cloning happens only after the user approves the offer in step 5.
5. **Report before mutating.** Root cause in one or two sentences, the exact log line or spec field that proves it, and the proposed fix as a concrete action. Then:
   - **If the cause is proven** (a specific log line or spec field demonstrates it): present it confidently as the root cause and proposed fix.
   - **If you are not confident** — cause is inferred, evidence is indirect, or multiple causes are plausible: say so plainly ("I can't prove this from the logs — my best hypothesis is … because …") and **stop and ask for the user's go-ahead before any change, read-only clone included.** Lay out the hypothesis, the evidence you have, the evidence you're missing, and the next step you'd take. Do not proceed on a guess.
   - Spec/config fix → propose it; apply via `apps-update` only after the user confirms.
   - Code fix → after stating the root cause, make this explicit offer: "I can clone the repo (and read any needed repo files), apply this fix on a branch, and open a pull request for you to review. Want me to do that?" Only run `git clone` (and any `webfetch` repo-file reads) after they say yes. After cloning, state the branch name and the exact change before pushing, and only push/open the PR after a second explicit confirmation. Never push to the default branch; always a feature branch + PR. Never push without that confirmation. When the clone is approved, clone over https with `x-access-token` as the username and the token as the password (repo URL is in the brief or via `apps-get-info`); if it 403s on an org repo, the org restricts OAuth apps — tell the user it needs org approval and continue log-only. If the app uses a `github:` source with `deploy_on_push`, note that merging the PR will trigger a new deployment.
   - `apps-delete` / recreate → never without explicit user confirmation; it changes the app's URL. Prefer `github:` source with `deploy_on_push` when recreating, so future pushes deploy without the commit-pinning problem.
6. **Verify the fix.** After the fix lands (PR merged, or spec update applied), poll `apps-get-deployment-status` until ACTIVE (a real build takes 3-5 minutes; flipping ACTIVE in seconds means the build was skipped — see gotchas), then curl the live URL.

If GitHub is not connected (no GITHUB_TOKEN, or the user declines consent): diagnose from logs and spec only, and hand the user the patch to apply themselves. Never block on GitHub access.

## Gotchas (learned the hard way — do not rediscover these)

- **Managed Postgres requires SSL with a self-signed CA — dev databases included.** A Node `pg` Pool pointed at `${db.DATABASE_URL}` crashes at boot with `self-signed certificate in certificate chain`, then health checks fail. When scaffolding any DB-backed app, write the SSL config from the start: `new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })` for demos/dev, or the managed DB's CA cert via `ssl: { ca }` for production. Never ship a bare `new Pool({ connectionString })` against a managed database.
- **Generic `git` sources pin the commit at app creation.** Later `apps-update` calls rebuild the SAME commit, not the branch head. This is why new apps always use a `github:` source with `deploy_on_push: true`. If you inherit an app on a generic `git` source, shipping new code means push + `apps-delete` + `create-app-from-spec` again (the name/URL suffix changes — report the new one); propose migrating it to a `github:` source instead.
- **Vite preview 403s on App Platform's domain.** Any Vite app served with `vite preview` needs `preview: { allowedHosts: true }` in `vite.config.js` before the first deploy, or every request returns 403 "Blocked request. This host is not allowed."
- **Prefer static_sites over `vite preview`** when the app has no server — no host-check problem, no instance cost.
- **Static sites have no RUN logs** — `apps-get-logs` with `LogType: "RUN"` 400s for them. Debug static sites with `LogType: "BUILD"` only. RUN/DEPLOY logs apply to services.
- **Never print secrets.** GITHUB_TOKEN and env values stay out of replies, commits, and app spec plaintext fields (use `type: "SECRET"` env entries for credentials).
