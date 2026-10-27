# Decisions

## 2026-10-10: use Grok for the agent source; park Gemini and Antigravity

Decision. `agent:grok` is the agent source we use. `agent:gemini` and `agent:agy` stay
parked and are not run. Revisit Gemini once the process is streamlined, and then only as
a tool-calling step inside our own pipeline, not as a source that finds events itself.

Evidence. Pilot on one seed (`events.communitie.in/hyderabad`, events for Oct 10 and 11),
run against `data/pilot.sqlite`, one run per harness.

| | Grok | Gemini | agy |
|---|---|---|---|
| Wall time | 12m 1s | 8s | 8m 52s |
| Emitted | 69 | 0 | 23 |
| Accepted | 52 | 0 | 15 |
| Rejected | 17 | 0 | 8 |
| Accepted rows matching a Communitie row | 49 of 52 | n/a | 13 of 15 |

Why not Gemini. The CLI fails at login: "This client is no longer supported for Gemini
Code Assist for individuals", with a pointer to Antigravity. No model call is made, so
this says nothing about its quality.

Why not agy. It found a third of what Grok found on the same page, and its accepted
events were a subset of Grok's. No flag removes its shell: `--sandbox` limits terminal
commands only, and it used the shell to write and run a download script that read a file
from its own state directory. Too loose to run unattended.

Why Grok. It found the most events, and `--tools web_search,web_fetch,write_file` gives
it the narrowest tool scope of the three.

Caveats. One seed and one run each. Communitie is also a Tier A source, so it is the easy
case. Test Grok on a venue site with no API before drawing wider conclusions.

Follow-ups for Grok.
- The verifier rejected 10 real events because the agent reformatted the date quote
  (allevents.in writes "Sat, 10 Oct 2026 • 7:00 PM (IST)", the agent quoted "Sat, 10 Oct,
  2026 at 07:00 pm IST"). Consider matching on day, month and time tokens.
- Grok still loads the operator's MCP servers (a Playwright server appeared in the run
  directory). Block them.
- Open question Q13 (vendor terms for unattended use of a consumer subscription) still
  applies before any scheduled run.

Update 2026-10-10. The operator confirmed Grok only. The Gemini and agy harnesses, the
Gemini policy file and their doc mentions are removed. The Harness table keeps its shape,
so adding a harness later is one entry plus one registry line.

Update 2026-10-10 (later). The date check now verifies by parts (day, month, time within
60 characters), and run directories sit next to the --db file. Verification run on a copy
of the pilot DB: 53 emitted, 43 accepted, 0 rejections for date formatting (was 10 of 17).
The Grok MCP follow-up is still open.

## 2026-10-27: mobile stack confirmed; odiff for visual diffs, our own chat, WhatsApp codes

Decision. The mobile stack in plan section 2 stands, and the four Week 1 questions in
`docs/plans/mobile-app-brief.md` are answered. The monorepo works with Expo and Metro, so the
app lives in `apps/mobile` under Bun workspaces. Maps use `react-native-maps` 1.29.11. Visual
diffs use `odiff-bin` 4.5.0 at threshold 0.1, with baselines in Git LFS. The identity vendor is
dropped. The group thread is our own, polled while the screen is focused. Sign-in codes go by
WhatsApp, with no SMS. The full table with versions, sources and publish dates is
`docs/plans/mobile-stack.md`.

Evidence. Expo's monorepo guide (https://docs.expo.dev/guides/monorepos/) and its map view page
for SDK 58 (https://docs.expo.dev/versions/v58.0.0/sdk/map-view/). Every version was read from
the npm `time` entry on 2026-10-27 and held to the 14-day rule at the scaffold date,
2026-10-29 19:40 UTC. `odiff-bin` 4.5.0 is installed and the diff script runs against generated
sample PNGs (same, changed, missing, new, resized) in `test/visualDiff.test.ts`.

Why. A monorepo keeps `@turnout/contract` one source for the server and the app. `expo-maps`
needs iOS 17, and the plan supports iOS 16.4. odiff is free and fast, and a threshold of 0.1
leaves room for anti-aliasing. The identity check is gone from v1, replaced by the handle check
and the ban list. A text thread for one group needs none of a chat SDK's moderation and read
state. WhatsApp codes cost about 0.136 INR each with GST and have one-tap autofill on Android.

Caveats. Uniwind against NativeWind is not decided: the F8 spike on 2026-10-30 and 2026-11-02
decides it, and NativeWind 4.2.7 stays as the fallback until after M5. Several Expo-managed
versions are candidates that `expo install` may move at the scaffold. `posthog-react-native`
4.84.2, `react-hook-form` 7.91.0, `@tanstack/react-query` 5.105.0 and `eas-cli` 26.0.0 are under
14 days old today, so older versions are listed. Baseline LFS use is an estimate (about 168 MB a
set, about 2 GB a month of bandwidth) until the first snapshot on 2026-11-02. The iOS gaps (no
TestFlight, real iPhone, universal links, iOS push, or App Store listing) are listed in
`docs/plans/mobile-visual-testing.md`.
