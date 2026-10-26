export {};

/** `bun run e2e`: picks two free ports (site and admin), then lets Playwright start the fixture servers on them and run the specs headless. */
/**
 * Two free ports below the OS's ephemeral range (49152 and up). The admin console starts an inner server on port 0 and the
 * OS could hand it a port we had just released, so ports picked from the ephemeral range collide now and then.
 */
function freePorts(): [number, number] {
  const probes: Array<ReturnType<typeof Bun.serve>> = [];
  while (probes.length < 2) {
    try {
      probes.push(Bun.serve({ port: 20_000 + Math.floor(Math.random() * 20_000), fetch: () => new Response("") }));
    } catch {
      // taken: try another
    }
  }
  const ports = probes.map((p) => p.port!) as [number, number];
  for (const p of probes) p.stop(true);
  return ports;
}
const [sitePort, adminPort] = freePorts();

const run = Bun.spawn(["node_modules/.bin/playwright", "test", ...process.argv.slice(2)], {
  env: { ...process.env, E2E_PORT: String(sitePort), E2E_ADMIN_PORT: String(adminPort) },
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await run.exited);
