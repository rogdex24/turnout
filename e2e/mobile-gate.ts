/**
 * The app's connection to the seeded mobile server, as a TCP pass-through on the port the app is built with. The offline-home flow
 * turns it off through the operator's `POST /operator/network`: open connections are cut and new ones are closed as they arrive, so
 * the app's fetch throws the way it does with no network. Airplane mode cannot do this: the Android emulator still reaches the host
 * at 10.0.2.2 and adb reverse with it on, and Maestro cannot turn it on in the iOS simulator.
 */
import net from "node:net";

export type Gate = {
  port: number;
  online: () => boolean;
  setOnline: (online: boolean) => void;
  stop: () => Promise<void>;
};

/** Listens on `port` and passes each connection through to `targetPort` on the loopback while the gate is online. */
export function startGate(port: number, targetPort: number): Promise<Gate> {
  let online = true;
  const open = new Set<net.Socket>();
  // Half open, so a side that has sent all it has can still read the answer (adb reverse closes its sending side early).
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    if (!online) {
      client.destroy();
      return;
    }
    const upstream = net.connect({ port: targetPort, host: "127.0.0.1", allowHalfOpen: true });
    const close = () => {
      client.destroy();
      upstream.destroy();
      open.delete(client);
      open.delete(upstream);
    };
    open.add(client);
    open.add(upstream);
    for (const socket of [client, upstream]) {
      socket.on("error", close);
      socket.on("close", close);
    }
    client.pipe(upstream).pipe(client);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      resolve({
        port,
        online: () => online,
        setOnline: (next) => {
          online = next;
          if (next) return;
          for (const socket of open) socket.destroy();
          open.clear();
        },
        stop: () =>
          new Promise<void>((done) => {
            for (const socket of open) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}
