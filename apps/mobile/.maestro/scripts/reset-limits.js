// Empties the staging server's rate limits, so a flow that signs in a seeded member again within a few minutes is not told "Too many
// tries". Several flows sign in the same members one after another, faster than a person would.
// Runs in Maestro's script engine. SERVER_URL and TEST_TOKEN come from the flow's env.
const response = http.post(SERVER_URL + "/api/app/v1/__test/limits", {
  headers: { "Content-Type": "application/json", "x-staging-test-token": TEST_TOKEN },
  body: "{}",
});
if (!response.ok) {
  throw new Error("The limits route answered " + response.status + " at " + SERVER_URL);
}
