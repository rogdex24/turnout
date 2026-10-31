// Fails the flow unless the analytics events the e2e app sent (to the server's capture sink, not to PostHog) include EXPECT, a comma
// list of event names, in that order. Other events may sit between them. The SDK sends in batches every 10 seconds, so the server
// holds each read open for up to 4 seconds until the names have arrived, and this asks again for up to 40 seconds in all.
// Runs in Maestro's script engine, where `http` and `json` are globals. SERVER_URL, TEST_TOKEN and EXPECT come from the flow's env.
if (!TEST_TOKEN) {
  throw new Error("TEST_TOKEN is empty: pass the STAGING_TEST_TOKEN the server printed with -e TEST_TOKEN=...");
}
const url = SERVER_URL + "/api/app/v1/__test/posthog/events?waitMs=4000&until=" + encodeURIComponent(EXPECT);
let result = null;
for (let attempt = 0; attempt < 10; attempt++) {
  const response = http.get(url, { headers: { "x-staging-test-token": TEST_TOKEN } });
  if (!response.ok) {
    throw new Error("The capture sink answered " + response.status + " at " + SERVER_URL);
  }
  result = json(response.body);
  if (result.matched) break;
}
const names = result.events.map((item) => item.event);
if (!result.matched) {
  throw new Error("Expected the events " + EXPECT + " in that order, the sink has: " + (names.join(",") || "none"));
}
output.events = names.join(",");
