import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

// Nothing here gets past validation, so neither is ever reached; they are
// replaced because importing the routes imports them.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

// /api/admin/classes revalidates through the class catalogue, which builds
// a real Sanity client the moment it is imported.
vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

import { PUT as bookingsPut } from "@/app/api/admin/bookings/route";
import {
  POST as classesPost,
  PUT as classesPut,
} from "@/app/api/admin/classes/route";
import { PUT as messagesPut } from "@/app/api/admin/messages/route";
import { PUT as pricingPut } from "@/app/api/admin/pricing/route";
import { POST as resendPost } from "@/app/api/admin/resend-email/route";
import {
  DELETE as schedulesDelete,
  POST as schedulesPost,
  PUT as schedulesPut,
} from "@/app/api/admin/schedules/route";
import {
  DELETE as offerDelete,
  POST as offerPost,
} from "@/app/api/admin/waitlist/offer/route";
import {
  DELETE as waitlistDelete,
  GET as waitlistGet,
} from "@/app/api/admin/waitlist/route";
import { signedInAsAdmin } from "../support/admin-session";

/**
 * The admin pages render `data.error` straight into a `window.alert`, so a
 * refusal is copy Gabrielle reads. Every message therefore lives in the schema
 * that refused; these are zod's own phrasings, and none of them should ever
 * reach her.
 */
const ZOD_PHRASING = [
  /^Invalid input/,
  /^Invalid option/,
  /^Too small/,
  /^Too big/,
  /^Unrecognized key/,
  /expected .+, received/,
];

type Handler = (request: Request) => Promise<Response>;

function body(handler: Handler, value: unknown): [Handler, Request] {
  return [
    handler,
    new Request("http://localhost:3000/api/admin/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  ];
}

function query(handler: Handler, search: string): [Handler, Request] {
  return [
    handler,
    new Request(`http://localhost:3000/api/admin/x${search}`, {
      method: "DELETE",
    }),
  ];
}

const PROBES: Array<[string, Handler, Request]> = [
  ["bookings: nothing at all", ...body(bookingsPut, {})],
  ["bookings: no transition asked for", ...body(bookingsPut, { id: 1 })],
  [
    "bookings: a target that is not an id",
    ...body(bookingsPut, { id: 1, newScheduleId: -3 }),
  ],
  [
    "bookings: a status that is not text",
    ...body(bookingsPut, { id: 1, status: 5 }),
  ],

  ["messages: nothing at all", ...body(messagesPut, {})],
  ["messages: a non-numeric id", ...body(messagesPut, { id: "12" })],
  ["messages: read as a word", ...body(messagesPut, { id: 1, read: "yes" })],

  ["pricing: nothing at all", ...body(pricingPut, {})],
  [
    "pricing: credits sent as text",
    ...body(pricingPut, { bundleConfigs: [{ id: 1, credits: "6" }] }),
  ],
  [
    "pricing: updates that are not a list",
    ...body(pricingPut, { bundleConfigs: {} }),
  ],

  ["classes create: nothing at all", ...body(classesPost, {})],
  [
    "classes create: no slug",
    ...body(classesPost, {
      title: "X",
      category: "class",
      priceInPence: 100,
    }),
  ],
  [
    "classes create: a slug with spaces",
    ...body(classesPost, {
      title: "X",
      slug: "not a slug",
      category: "class",
      priceInPence: 100,
    }),
  ],
  [
    "classes create: a category that does not exist",
    ...body(classesPost, {
      title: "X",
      slug: "x",
      category: "retreat",
      priceInPence: 100,
    }),
  ],
  [
    "classes create: a price sent as text",
    ...body(classesPost, {
      title: "X",
      slug: "x",
      category: "class",
      priceInPence: "1500",
    }),
  ],
  ["classes update: nothing at all", ...body(classesPut, {})],
  ["classes update: naming no field to change", ...body(classesPut, { id: 1 })],
  [
    "classes update: active sent as a word",
    ...body(classesPut, { id: 1, active: "yes" }),
  ],

  ["resend-email: nothing at all", ...body(resendPost, {})],
  [
    "resend-email: an id that is not a number",
    ...body(resendPost, { type: "booking", id: "12" }),
  ],

  ["schedules create: nothing at all", ...body(schedulesPost, {})],
  [
    "schedules create: a capacity that is not a number",
    ...body(schedulesPost, {
      classId: 1,
      date: "2026-05-01",
      startTime: "09:00",
      endTime: "10:00",
      capacity: "eight",
    }),
  ],
  ["schedules update: nothing at all", ...body(schedulesPut, {})],
  [
    "schedules update: a status that does not exist",
    ...body(schedulesPut, { id: 1, status: "postponed" }),
  ],
  [
    "schedules update: a location that is not text",
    ...body(schedulesPut, { id: 1, location: 5 }),
  ],
  [
    "schedules update: a fractional number of weeks",
    ...body(schedulesPut, { id: 1, repeatWeekly: true, numberOfWeeks: 2.5 }),
  ],
  ["schedules delete: nothing at all", ...body(schedulesDelete, {})],

  ["offer: nothing at all", ...body(offerPost, {})],
  [
    "offer: a hold that is not on offer",
    ...body(offerPost, { entryId: 1, hold: "72h" }),
  ],
  ["offer withdraw: no entryId", ...query(offerDelete, "")],
  [
    "offer withdraw: an entryId that is not a number",
    ...query(offerDelete, "?entryId=abc"),
  ],

  ["waitlist: no scheduleId", ...query(waitlistGet, "")],
  [
    "waitlist: a scheduleId that is not a number",
    ...query(waitlistGet, "?scheduleId=abc"),
  ],
  ["waitlist remove: no id", ...query(waitlistDelete, "")],
];

describe("every admin refusal is written in the schema, not by zod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
  });

  it("probes every admin schema", () => {
    expect(PROBES.length).toBeGreaterThanOrEqual(28);
  });

  it.each(PROBES)("%s", async (_name, handler, request) => {
    const response = await handler(request.clone());

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: string };
    expect(typeof error).toBe("string");
    for (const phrasing of ZOD_PHRASING) {
      expect(error).not.toMatch(phrasing);
    }
  });
});
