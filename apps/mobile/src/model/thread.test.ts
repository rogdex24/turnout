import type { Message } from "@turnout/contract/app/thread";
import { clipForDisk, KEPT_ON_DISK, mergeMessages, threadClosesAt, threadItems, threadPhase } from "./thread";

const SHOW_STARTS_AT = "2026-11-07T13:30:00.000Z";
const START = Date.parse(SHOW_STARTS_AT);
const HOUR = 3_600_000;

function message(id: string, over: Partial<Message> = {}): Message {
  return { id, memberRef: "m-priya", firstName: "Priya", body: `text ${id}`, createdAt: "2026-11-07T10:31:00.000Z", isYou: false, ...over };
}

describe("threadPhase", () => {
  it("waits until 3 hours before the show, is open for a day after it starts, then reads only", () => {
    expect(threadPhase(SHOW_STARTS_AT, START - 3 * HOUR - 1)).toBe("waiting");
    expect(threadPhase(SHOW_STARTS_AT, START - 3 * HOUR)).toBe("open");
    expect(threadPhase(SHOW_STARTS_AT, START + 24 * HOUR - 1)).toBe("open");
    expect(threadPhase(SHOW_STARTS_AT, START + 24 * HOUR)).toBe("read_only");
    expect(threadPhase(SHOW_STARTS_AT, START + 30 * 24 * HOUR - 1)).toBe("read_only");
    expect(threadPhase(SHOW_STARTS_AT, START + 30 * 24 * HOUR)).toBe("gone");
  });

  it("reads a start it cannot parse as waiting", () => {
    expect(threadPhase("soon", START)).toBe("waiting");
    expect(threadClosesAt("soon")).toBeNull();
  });

  it("closes a day after the start", () => {
    expect(threadClosesAt(SHOW_STARTS_AT)).toBe("2026-11-08T13:30:00.000Z");
  });
});

describe("mergeMessages", () => {
  it("keeps each id once and in order", () => {
    const merged = mergeMessages([message("01"), message("03")], [message("03", { body: "again" }), message("02")]);
    expect(merged.map((m) => m.id)).toEqual(["01", "02", "03"]);
    expect(merged[2]?.body).toBe("again");
  });
});

describe("clipForDisk", () => {
  it("keeps a short thread whole", () => {
    const data = { messages: [message("01")], thread: "open" as const, complete: true };
    expect(clipForDisk(data)).toBe(data);
  });

  it("keeps the newest messages and says the copy is not complete", () => {
    const messages = Array.from({ length: KEPT_ON_DISK + 5 }, (_, i) => message(String(i).padStart(3, "0")));
    const clipped = clipForDisk({ messages, thread: "open", complete: true });
    expect(clipped.messages).toHaveLength(KEPT_ON_DISK);
    expect(clipped.messages[0]?.id).toBe("005");
    expect(clipped.complete).toBe(false);
  });
});

describe("threadItems", () => {
  it("starts a run at a new sender and after a gap, and carries the time", () => {
    const items = threadItems(
      [
        message("01"),
        message("02", { createdAt: "2026-11-07T10:33:00.000Z" }),
        message("03", { memberRef: "m-sana", firstName: "Sana", createdAt: "2026-11-07T10:34:00.000Z" }),
        message("04", { memberRef: "m-sana", firstName: "Sana", createdAt: "2026-11-07T10:50:00.000Z" }),
      ],
      [],
      "You",
    );
    expect(items.map((item) => item.startsRun)).toEqual([true, false, true, true]);
    expect(items[0]?.time).toBe("4:01 PM");
  });

  it("puts the person's own unsent messages last, as one run with the ones already stored", () => {
    const items = threadItems(
      [message("01", { memberRef: "m-you", firstName: "Ananya", isYou: true })],
      [{ clientId: "abc12345", body: "On my way", sentAt: "2026-11-07T10:32:00.000Z", status: "queued" }],
      "You",
    );
    expect(items.map((item) => [item.body, item.status, item.startsRun, item.clientId])).toEqual([
      ["text 01", "sent", true, null],
      ["On my way", "queued", false, "abc12345"],
    ]);
    expect(items[1]?.firstName).toBe("You");
  });
});
