// Turns the app's connection to the seeded server off or on, through the operator's network route (e2e/mobile-gate.ts). With it off,
// every request from the app fails in the transport, as it does with no network, on Android and on iOS.
// Runs in Maestro's script engine. SERVER_URL, TEST_TOKEN and ONLINE ("true" or "false") come from the flow's env.
const operatorUrl = SERVER_URL.replace(/:(\d+)$/, (_, port) => ":" + (Number(port) + 1));
const response = http.post(operatorUrl + "/operator/network", {
  headers: { "Content-Type": "application/json", "x-staging-test-token": TEST_TOKEN },
  body: JSON.stringify({ online: ONLINE === "true" }),
});
if (!response.ok) {
  throw new Error("The network route answered " + response.status + " at " + operatorUrl + ": " + response.body);
}
