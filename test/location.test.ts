import { describe, expect, test } from "bun:test";
import * as contract from "@turnout/contract";
import type { ZodType } from "zod";
import { appRoutes } from "../src/app-api/routes/index.js";
import { testApp } from "./appHelpers.js";
import { memberSession } from "./helpers/appFixture.js";

/** A path for a route pattern, with each parameter filled in. */
const fill = (pattern: string): string => pattern.replace(/:[A-Za-z]+/g, "x1").replace("*", "photos/x.jpg");

const LAT = 31.4159;
const LNG = 27.1828;
/** The schemas an app request is read through: a body, a patch, an input or a query. */
const REQUEST_SCHEMA = /(Request|Patch|Input|Query)Schema$/;
/** Not request bodies: a loose check on a phone string used inside other schemas. */
const NOT_REQUESTS = new Set(["phoneInputSchema"]);

describe("the server never takes a location", () => {
  test("every request schema in the contract is strict, so lat and lng are refused by name", () => {
    const schemas = Object.entries(contract).filter(([name]) => REQUEST_SCHEMA.test(name) && !NOT_REQUESTS.has(name)) as [
      string,
      ZodType,
    ][];
    expect(schemas.length).toBeGreaterThan(10);
    for (const [name, schema] of schemas) {
      const result = schema.safeParse({ lat: LAT, lng: LNG });
      expect([name, result.success]).toEqual([name, false]);
      const keys = result.success ? [] : result.error.issues.flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys : []));
      expect([name, keys.sort()]).toEqual([name, ["lat", "lng"]]);
    }
  });

  test("no route stores a location it is sent, in a body or in a query", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    for (const route of appRoutes(t.app)) {
      const token = route.auth === "member" ? who.token : undefined;
      const path = fill(route.pattern);
      if (route.method === "GET") await t.call("GET", `${path}?lat=${LAT}&lng=${LNG}`, { token });
      else await t.call(route.method, path, { token, body: { lat: LAT, lng: LNG } });
    }
    const tables = t.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
      name: string;
    }[];
    for (const { name } of tables) {
      const columns = t.db.query(`PRAGMA table_info(${name})`).all() as { name: string }[];
      for (const column of columns) {
        for (const needle of [String(LAT), String(LNG)]) {
          const row = t.db.query(`SELECT COUNT(*) AS n FROM ${name} WHERE CAST(${column.name} AS TEXT) LIKE ?`).get(`%${needle}%`) as {
            n: number;
          };
          expect([name, column.name, needle, row.n]).toEqual([name, column.name, needle, 0]);
        }
      }
    }
  });

  test("a route that reads a JSON body answers 400 to one with a location in it", async () => {
    const t = await testApp();
    const who = await memberSession(t, 0);
    const bodies: [string, string][] = [
      ["POST", "/auth/otp"],
      ["POST", "/auth/otp/verify"],
      ["POST", "/auth/refresh"],
      ["PATCH", "/me/profile"],
      ["PUT", "/me/handle"],
      ["POST", "/me/consent"],
      ["POST", "/me/delete-code"],
      ["DELETE", "/me"],
      ["POST", "/plans"],
      ["POST", "/plans/x1/withdraw"],
      ["POST", "/groups/x1/checkin"],
      ["POST", "/groups/x1/messages"],
      ["POST", "/groups/x1/downvotes"],
      ["POST", "/notices/read"],
      ["POST", "/devices"],
    ];
    const known = new Set(appRoutes(t.app).map((route) => `${route.method} ${route.pattern.replace(/:[A-Za-z]+/g, "x1")}`));
    const real = bodies.filter(([method, path]) => known.has(`${method} ${path}`));
    expect(real.length).toBeGreaterThanOrEqual(12);
    for (const [method, path] of real) {
      const response = await t.call(method, path, { token: who.token, body: { lat: LAT, lng: LNG } });
      expect([method, path, response.status]).toEqual([method, path, 400]);
    }
  });
});
