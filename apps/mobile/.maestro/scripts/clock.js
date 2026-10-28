// Moves the seeded server's clock forward by ADVANCE_HOURS and runs one ticker pass, so the lock at T-24h and what follows from it
// happen now. The server runs with --no-ticker, so nothing else would. The phone's own clock does not move.
// Runs in Maestro's script engine. SERVER_URL, TEST_TOKEN and ADVANCE_HOURS come from the flow's env.
const response = http.post(SERVER_URL + "/api/app/v1/__test/clock", {
  headers: { "Content-Type": "application/json", "x-staging-test-token": TEST_TOKEN },
  body: JSON.stringify({ advanceMs: Number(ADVANCE_HOURS) * 3600 * 1000, tick: true }),
});
if (!response.ok) {
  throw new Error("The clock route answered " + response.status + " at " + SERVER_URL + ": " + response.body);
}
