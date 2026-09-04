---
name: sandbox-access
description: "How the user reaches this sandbox from their own computer: `doctl agents port-forward` to tunnel to a server running here, `doctl agents exec` to run a command here from their shell. Read when starting a web server, dev server, or any process that listens on a port; when building or changing a UI the user will want to look at in their own browser; and when they ask how to see, open, or test what is running."
---

This sandbox runs on DigitalOcean, not on the user's machine. Nothing you bind here is reachable from their browser, and they cannot see a process you leave running. Two `doctl` commands close that gap — tell them which one to run instead of assuming they know it.

## After starting a server, hand over a port-forward command

The tunnel dials loopback inside this sandbox, so a dev server on its default host is already reachable — do not add `--host 0.0.0.0` to "expose" it. Tell the user to run, and leave running:

```
doctl agents port-forward 01a06c96-0363-78be-a2b4-1e8a896fda8f 5173
```

Name the port your server actually bound (Vite 5173, Next and CRA 3000, Storybook 6006, Django 8000). While that runs they open `http://127.0.0.1:5173` in their own browser and see the real page.

The banner your dev server prints (`Local: http://localhost:5173`) is that address *inside* this sandbox. Same port, but reachable only once the forward is up — do not hand it over as though it already worked.

### One-time setup, not a per-change step

This is the main loop for UI work, so be exact about it. One forward covers the whole session: it carries the websocket hot reload uses, so their browser updates as you edit, and restarting the dev server does not break it — a refresh reconnects. Ask them to start it once, then just say what changed and what to look at. Do not re-post the command every turn.

- `8080:5173` maps a different local port when theirs is taken; `0:5173` lets their OS pick one and prints it.
- Forward several at once when the page needs a backend, or when the framework serves hot reload on its own port: `doctl agents port-forward 01a06c96-0363-78be-a2b4-1e8a896fda8f 5173 8000`.
- Only ports 1024-65535 forward. The command holds its terminal until Ctrl-C, so it needs a shell of its own.

Do this every time you start something that listens — dev server, preview build, database, debugger. Do not report a server as running without it, and do not hand them a URL for a port they have no tunnel to.

## Point them at exec when they want to drive the sandbox themselves

They can run one command in here from their own shell:

```
doctl agents exec 01a06c96-0363-78be-a2b4-1e8a896fda8f -- go test ./...
```

Output comes back to their terminal and the command's exit code becomes doctl's, so it composes in their pipelines and `&&` chains. Recommend it when they want to reproduce a failure, inspect state, or script against this workspace without going through you.

- Everything after `--` runs here; the separator is required for a command carrying flags of its own.
- Each call is independent — no shell state carries over, so `cd` does not persist. Use `--workdir /workspace/src`, or `-- sh -c 'cd src && make'`.
- Output is buffered until the command exits and capped at 1 MiB per stream, so a long build prints nothing until it finishes. `--timeout <seconds>` raises the default; the server caps it.
