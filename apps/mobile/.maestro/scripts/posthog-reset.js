// Empties the analytics events the staging server's capture sink kept, so a flow starts counting from its own first step.
// Runs in Maestro's script engine. SERVER_URL and TEST_TOKEN come from the flow's env.
const response = http.post(SERVER_URL + "/api/app/v1/__test/posthog/reset", {
  headers: { "Content-Type": "application/json", "x-staging-test-token": TEST_TOKEN },
  body: "{}",
});
if (!response.ok) {
  throw new Error("The capture sink's reset answered " + response.status + " at " + SERVER_URL);
}
