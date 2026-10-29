import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { queryKeys } from "@/api/keys";
import { ticketAsked } from "@/api/prefs";
import { clearTestClients, json, type RouteReply } from "@/api/testing";
import { common } from "@/copy/common";
import { ticket as copy } from "@/copy/ticket";
import { memberShowFixture, PLANS } from "@/model/planFixtures";
import type { PickedTicket } from "@/model/ticketFile";
import { AppProviders } from "@/providers/AppProviders";
import { createTestApp, meFixture } from "@/providers/testing";
import { askNotifications } from "./askNotifications";
import { TicketScreen } from "./TicketScreen";
import { chooseTicket, readTicket } from "./ticketPicker";

jest.mock("./ticketPicker", () => ({ chooseTicket: jest.fn(), readTicket: jest.fn() }));
jest.mock("./askNotifications", () => ({ askNotifications: jest.fn() }));

const choose = jest.mocked(chooseTicket);
const read = jest.mocked(readTicket);
const ask = jest.mocked(askNotifications);

const shot: PickedTicket = { uri: "file:///cache/shot.png", name: "shot.png", mime: "image/png", bytes: 120_000 };

beforeEach(() => {
  choose.mockReset();
  read.mockReset().mockResolvedValue(new Blob(["png"]));
  ask.mockReset().mockResolvedValue(true);
});
afterEach(() => clearTestClients());

async function open(plan: (typeof PLANS)[keyof typeof PLANS], routes: Record<string, RouteReply | RouteReply[]> = {}) {
  const handlers = { onBack: jest.fn(), onLater: jest.fn(), onDone: jest.fn(), onPlan: jest.fn() };
  const app = await createTestApp({
    me: meFixture(),
    welcomeSeen: true,
    routes: {
      [`GET /plans/${plan.id}`]: json(200, plan),
      "GET /shows/monsoon-theory": json(200, memberShowFixture()),
      ...routes,
    },
  });
  await render(
    <AppProviders deps={app.deps}>
      <TicketScreen planId={plan.id} {...handlers} />
    </AppProviders>,
  );
  return { ...app, ...handlers };
}

async function pickAndSend() {
  choose.mockResolvedValue(shot);
  await fireEvent.press(await screen.findByTestId("ticket-choose"));
  await fireEvent.press(await screen.findByTestId("ticket-send"));
}

describe("TicketScreen", () => {
  it("asks for the screenshot, and keeps the page honest about what it needs", async () => {
    await open(PLANS.needs_ticket);
    expect(await screen.findByText(copy.add.title.screenshot)).toBeOnTheScreen();
    expect(screen.getByText(copy.add.emptyTitle)).toBeOnTheScreen();
    expect(screen.getByText(copy.deleted)).toBeOnTheScreen();
    for (const line of copy.add.shows) expect(screen.getByText(line)).toBeOnTheScreen();
  });

  it("sends the chosen file as the body, with progress, and moves to checking", async () => {
    const plan = PLANS.needs_ticket;
    const checking = { ...PLANS.checking_ticket, id: plan.id };
    const app = await open(plan, {
      [`PUT /plans/${plan.id}/ticket`]: (request) => {
        request.onProgress?.(50, 100);
        return json(200, checking);
      },
    });
    await pickAndSend();
    expect(await screen.findByText(copy.checking.title)).toBeOnTheScreen();
    const [call] = app.transport.callsTo(`PUT /plans/${plan.id}/ticket`) as unknown as { body: unknown }[];
    expect(call?.body).toBeInstanceOf(Blob);
    expect(app.queryClient.getQueryData(queryKeys.planDetail(plan.id))).toEqual(checking);
  });

  it("asks about notifications once, after the first ticket, and only asks the system when told yes", async () => {
    const plan = PLANS.needs_ticket;
    const app = await open(plan, { [`PUT /plans/${plan.id}/ticket`]: json(200, { ...PLANS.checking_ticket, id: plan.id }) });
    await pickAndSend();
    expect(await screen.findByText(copy.notify.title)).toBeOnTheScreen();
    expect(ask).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("ticket-notify-on"));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(copy.notify.title)).toBeNull();
    expect(ticketAsked(app.prefs)).toBe(true);
  });

  it("does not ask again after a first answer of not now", async () => {
    const plan = PLANS.needs_ticket;
    const app = await open(plan, { [`PUT /plans/${plan.id}/ticket`]: json(200, { ...PLANS.checking_ticket, id: plan.id }) });
    app.prefs.set("ticketAsked", "1");
    await pickAndSend();
    await screen.findByText(copy.checking.title);
    expect(screen.queryByText(copy.notify.title)).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it("refuses a PDF for BookMyShow before anything is sent", async () => {
    const plan = PLANS.needs_ticket;
    const app = await open(plan);
    choose.mockResolvedValue({ ...shot, name: "ticket.pdf", mime: "application/pdf" });
    await fireEvent.press(await screen.findByTestId("ticket-choose"));
    expect(await screen.findByText(copy.problems.screenshot_required)).toBeOnTheScreen();
    expect(screen.getByTestId("ticket-send").props.accessibilityState).toMatchObject({ disabled: true });
    expect(app.transport.callsTo(`PUT /plans/${plan.id}/ticket`)).toHaveLength(0);
  });

  it("takes a PDF for a seller that allows one", async () => {
    const plan = PLANS.needs_ticket;
    await open(plan, { "GET /shows/monsoon-theory": json(200, memberShowFixture({ proofKind: "screenshot_or_pdf" })) });
    await screen.findByText(copy.add.title.screenshot_or_pdf);
    choose.mockResolvedValue({ ...shot, name: "ticket.pdf", mime: "application/pdf" });
    await fireEvent.press(await screen.findByTestId("ticket-choose"));
    expect(screen.queryByTestId("ticket-problem")).toBeNull();
    expect(screen.getByTestId("ticket-send").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("keeps the chosen file when the server refuses it, and lets another be chosen", async () => {
    const plan = PLANS.needs_ticket;
    await open(plan, {
      [`PUT /plans/${plan.id}/ticket`]: json(400, { error: { code: "bad_ticket", message: "Not a picture." } }),
    });
    await pickAndSend();
    expect(await screen.findByText(copy.problems.bad_ticket)).toBeOnTheScreen();
    expect(screen.getByTestId("ticket-file")).toBeOnTheScreen();
    choose.mockResolvedValue({ ...shot, name: "other.png" });
    await fireEvent.press(screen.getByTestId("ticket-another"));
    await waitFor(() => expect(screen.queryByTestId("ticket-problem")).toBeNull());
    expect(screen.getByLabelText(copy.add.chosenLabel("other.png"))).toBeOnTheScreen();
  });

  it("keeps the file through an offline spell and says so", async () => {
    const plan = PLANS.needs_ticket;
    const app = await open(plan, { [`PUT /plans/${plan.id}/ticket`]: new Error("offline") });
    await pickAndSend();
    expect(await screen.findByText(copy.problems.offline)).toBeOnTheScreen();
    expect(screen.getByTestId("ticket-file")).toBeOnTheScreen();
    expect(app.deps.connectivity.isOffline()).toBe(true);
    // Send waits for the connection; the file is not lost.
    expect(screen.getByTestId("ticket-send").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => app.deps.connectivity.report(true));
    expect(screen.getByTestId("ticket-send").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("shows the waiting page for a ticket in the check, with nothing to do but Done", async () => {
    const app = await open(PLANS.checking_ticket);
    expect(await screen.findByText(copy.checking.body)).toBeOnTheScreen();
    expect(screen.getByText(copy.deleted)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("ticket-done"));
    expect(app.onDone).toHaveBeenCalled();
  });

  it("gives the reason for a ticket that was turned down, in plain words, and offers another", async () => {
    await open({ ...PLANS.ticket_rejected, ticket: { state: "rejected", rejectReason: "wrong_date" } });
    expect(await screen.findByText(copy.rejected.title)).toBeOnTheScreen();
    expect(screen.getByText(copy.rejected.reasons.wrong_date)).toBeOnTheScreen();
    expect(screen.getByText(copy.rejected.choose)).toBeOnTheScreen();
  });

  it("leaves for the plan page when the ticket is already accepted", async () => {
    const app = await open(PLANS.finding_group);
    await waitFor(() => expect(app.onPlan).toHaveBeenCalled());
  });

  it("goes back from I'll do it later without sending", async () => {
    const app = await open(PLANS.needs_ticket);
    await fireEvent.press(await screen.findByTestId("ticket-later"));
    expect(app.onLater).toHaveBeenCalled();
  });

  it("offers a retry when the plan cannot be loaded", async () => {
    const plan = PLANS.needs_ticket;
    const app = await open(plan, { [`GET /plans/${plan.id}`]: json(400, { error: { code: "bad_request", message: "No." } }) });
    app.queryClient.setQueryDefaults(queryKeys.planDetail(plan.id), { retry: false });
    await act(() => app.queryClient.invalidateQueries({ queryKey: queryKeys.planDetail(plan.id) }));
    expect(await screen.findByText(common.errorGeneric)).toBeOnTheScreen();
    app.transport.set(`GET /plans/${plan.id}`, json(200, plan));
    await fireEvent.press(screen.getByText(common.retry));
    expect(await screen.findByText(copy.add.title.screenshot)).toBeOnTheScreen();
  });
});
