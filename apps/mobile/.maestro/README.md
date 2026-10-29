# Maestro flows

Flows run against the e2e variant (`com.turnout.app.e2e`, scheme `turnout-e2e`), which reaches the host at `10.0.2.2` on Android and
`localhost` on iOS. Maestro CLI 2.11.0 is the pinned version (https://docs.maestro.dev).

| Path | What it does |
|---|---|
| `config.yaml` | The workspace: runs `flows/*.yaml` in order |
| `flows/launch.yaml` | A fresh install opens and shows the Welcome screen |
| `flows/smoke.yaml` | Checks the seeded server answers, then does the launch check |
| `flows/onboarding.yaml` | The Welcome cards, the notice, sign-in with a code, and the profile form up to the photo |
| `flows/otp-errors.yaml` | The code step when it goes wrong: a wrong code, too many tries, a refusal, a number not on WhatsApp |
| `flows/browse.yaml` | Shows tab: the list, area pills, a card opening its show (ticket stub, Go with a group opening its sheet), and the handle check strip for a pending and a turned-down handle |
| `flows/deeplink-show.yaml` | A custom-scheme link to a show opens it (`show/<id>` and `e/<id>`), and a link to any other screen lands on Home |
| `flows/loop-join.yaml` | Go with a group, the plan on Home and the Plans tab, then the plan moving as the operator answers: ticket checking, ticket accepted, finding a group |
| `flows/ticket-rejected.yaml` | A ticket the operator cannot use: the reason in plain words, Send another ticket, and a second ticket accepted |
| `flows/cancel.yaml` | Leave this plan: the sheet, Stay keeps the plan, Leave plan ends it |
| `flows/profile-check.yaml` | A handle in review turned down with a reason, Change handle sending a new one, and the operator accepting it so the strip goes |
| `flows/loop-group.yaml` | Three more people join Dev's show and the plan says group confirmed with a count and a reveal time, and no names |
| `flows/loop-no-group.yaml` | The server's clock passes T-24h with nobody to group with: the plan says no group this time and offers the next show |
| `flows/group-shrinks.yaml` | A locked group loses a person and goes ahead with three; the plan says so. Moves the clock, so it runs last |
| `flows/push-routing.yaml` | A tap on a push opens the screen its kind names, through the e2e build's `turnout-e2e://push` link; an unknown kind or a bad id lands on Home |
| `flows/loop-meet.yaml` | The meet card from the "Meet your group" push to "I'm here": the static map, the walk line from a set location, the Safety sheet and the check-in. Left out of the CI run until the seed has the group rows (tag `needs-group-seed`); needs a phone clock inside the check-in window (see its header) |
| `flows/thread.yaml` | The group chat from the meet card: another member's line arriving on the poll, a written line, a quick chip, no link in a line, and a long press offering Report. Same seed needs as loop-meet (tag `needs-group-seed`) |
| `flows/report.yaml` | Report someone from the Safety sheet: Call 112 on the form, Send waiting for a person, a report sent and a line that says nothing about what became of them. Same seed needs as loop-meet (tag `needs-group-seed`) |
| `subflows/` | Steps the flows share: open the phone step, send a code, enter a code, sign in as a seeded member, make a plan the way a person does, and call an operator route (`say` makes another member write to the group chat) |
| `visual/capture-story.yaml` | Opens one Storybook story and takes a screenshot (see `visual/README.md`) |
| `scripts/expect-events.js` | Fails a flow when the seeded server does not answer |
| `scripts/otp-code.js` | Reads the last sign-in code for a number from the server's test route (needs `TEST_TOKEN`) |
| `scripts/operator.js` | Calls the seeded server's operator routes (`e2e/mobile-operator.ts`), served on the port after the server's, which it works out from `SERVER_URL` |
| `scripts/clock.js` | Moves the seeded server's clock forward and runs one ticker pass (the server runs with `--no-ticker`) |
| `ci/device-run.sh` | What a CI device job runs: pins the clock and screen, runs the flows, then captures every story in `visual/stories.json` |

Run locally, with an e2e build installed on an emulator or simulator:

```
MOBILE_SERVER_PORT=3917 bun e2e/mobile-server.ts  # the seeded server, on the port the e2e build points at
maestro test -e SERVER_URL=http://localhost:3917 -e TEST_TOKEN=<the STAGING_TEST_TOKEN the server printed> apps/mobile/.maestro
```

The e2e build points at `E2E_API_PORT` (3917 by default), so start the server on that port with `MOBILE_SERVER_PORT`. CI does the same.

## The plan flows

A flow cannot open the admin app or sign in as the other members of a show, so the plan flows ask the seeded server to do what they
would: `e2e/mobile-operator.ts` answers handles and tickets, sends a ticket for a member (the system picker is not reachable from
Maestro; the upload is covered by the component tests), fills a show with members who have accepted tickets, and makes a member leave.
It starts with the server, on the port after it (`MOBILE_SERVER_PORT` + 1), takes the same `x-staging-test-token` and acts at the
server's clock. Run the plan flows in the order `config.yaml` gives: they share one server, and the last two move its clock.

The plan page and Home ask the server once a minute, so a flow waits up to 80 seconds for a change the operator made. The groups flag
is on in the e2e build (`EXPO_PUBLIC_GROUPS_ENABLED=1` in `ci/env.sh` and the `e2e` profile in `eas.json`), because these flows start from Go with a group.
