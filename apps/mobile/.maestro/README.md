# Maestro flows

Flows run against the e2e variant (`com.turnout.app.e2e`, scheme `turnout-e2e`), which reaches the host at `10.0.2.2` on Android and
`localhost` on iOS. Maestro CLI 2.11.0 is the pinned version (https://docs.maestro.dev).

| Path | What it does |
|---|---|
| `config.yaml` | The workspace: runs `flows/*.yaml` in order |
| `flows/launch.yaml` | A fresh install opens and shows the Welcome screen |
| `flows/smoke.yaml` | Checks the seeded server answers, then does the launch check |
| `visual/capture-story.yaml` | Opens one Storybook story and takes a screenshot (see `visual/README.md`) |
| `scripts/expect-events.js` | Fails a flow when the seeded server does not answer |
| `ci/device-run.sh` | What a CI device job runs: pins the clock and screen, runs the flows, then captures every story in `visual/stories.json` |

Run locally, with an e2e build installed on an emulator or simulator:

```
MOBILE_SERVER_PORT=3917 bun e2e/mobile-server.ts  # the seeded server, on the port the e2e build points at
maestro test -e SERVER_URL=http://localhost:3917 apps/mobile/.maestro
```

The e2e build points at `E2E_API_PORT` (3917 by default), so start the server on that port with `MOBILE_SERVER_PORT`. CI does the same.
