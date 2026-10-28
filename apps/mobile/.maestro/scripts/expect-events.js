// Fails the flow when the seeded server is not answering with events. Runs in Maestro's script engine, where `http` is a global.
const response = http.get(SERVER_URL + "/api/events?limit=1");
if (!response.ok) {
  throw new Error("The seeded server answered " + response.status + " at " + SERVER_URL + ". Start it with: bun e2e/mobile-server.ts");
}
