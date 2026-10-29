// Reads the last sign-in code the staging server's fake WhatsApp sender kept for PHONE and returns it as output.code.
// Runs in Maestro's script engine, where `http` and `json` are globals. SERVER_URL, TEST_TOKEN and PHONE come from the flow's env.
if (!TEST_TOKEN) {
  throw new Error("TEST_TOKEN is empty: pass the STAGING_TEST_TOKEN the server printed with -e TEST_TOKEN=...");
}
const response = http.post(SERVER_URL + "/api/app/v1/__test/otp", {
  headers: { "Content-Type": "application/json", "x-staging-test-token": TEST_TOKEN },
  body: JSON.stringify({ phone: PHONE }),
});
if (!response.ok) {
  throw new Error("No sign-in code for that number: the server answered " + response.status + " at " + SERVER_URL);
}
output.code = json(response.body).code;
