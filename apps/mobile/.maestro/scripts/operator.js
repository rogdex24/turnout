// Does what the operator, or the other members of a show, would do, through the seeded server's operator routes (e2e/mobile-operator.ts).
// Runs in Maestro's script engine, where `http` and `json` are globals. SERVER_URL and TEST_TOKEN come from the flow's env, with ROUTE
// (handle, send, ticket, crowd, withdraw, say, after or plan) and what the route needs: PHONE, EVENT_ID, DECISION, REASON, TEXT, or PHONES (comma separated).
// The plan route's answer is returned as output.planId and output.noticeId.
// The routes are served on the port after the server's, so a flow gets them from SERVER_URL alone.
const operatorUrl = SERVER_URL.replace(/:(\d+)$/, (_, port) => ":" + (Number(port) + 1));
const body = {};
if (typeof PHONE !== "undefined" && PHONE !== "") body.phone = PHONE;
if (typeof PHONES !== "undefined" && PHONES !== "") body.phones = PHONES.split(",");
if (typeof EVENT_ID !== "undefined" && EVENT_ID !== "") body.eventId = EVENT_ID;
if (typeof DECISION !== "undefined" && DECISION !== "") body.decision = DECISION;
if (typeof REASON !== "undefined" && REASON !== "") body.reason = REASON;
if (typeof TEXT !== "undefined" && TEXT !== "") body.text = TEXT;
const response = http.post(operatorUrl + "/operator/" + ROUTE, {
  headers: { "Content-Type": "application/json", "x-staging-test-token": TEST_TOKEN },
  body: JSON.stringify(body),
});
if (!response.ok) {
  throw new Error("The operator route " + ROUTE + " answered " + response.status + " at " + operatorUrl + ": " + response.body);
}
output.planId = json(response.body).planId || "";
output.noticeId = json(response.body).noticeId || "";
