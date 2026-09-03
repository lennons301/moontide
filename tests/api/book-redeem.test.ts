import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const {
  mockSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockInnerJoin,
  mockLeftJoin,
  mockInsertValues,
  mockInsertReturning,
  mockInsert,
  mockUpdateWhere,
  mockUpdateReturning,
  mockUpdateSet,
  mockUpdate,
  mockDeleteWhere,
  mockDelete,
  mockTransaction,
  mockSendBookingConfirmation,
  mockSendBookingNotification,
  mockAfter,
  mockFindSpendableBundle,
  mockSpendCredit,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelectFrom = vi.fn().mockReturnValue({
    where: mockSelectWhere,
    innerJoin: mockInnerJoin,
    leftJoin: mockLeftJoin,
  });
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
  const mockSendBookingConfirmation = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockSendBookingNotification = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockAfter = vi.fn((fn: () => Promise<void> | void) => fn());
  // The occupancy claim reads the row back via .returning() — a non-empty array
  // means the guarded UPDATE matched and the seat was taken. The bundle update
  // just awaits the where(), so the chain is both awaitable and chainable.
  const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockUpdateWhere = vi.fn(() =>
    Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
  );
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  const mockTransaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: mockInsert,
        update: mockUpdate,
        delete: mockDelete,
        select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
      };
      return await fn(tx);
    },
  );
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  // Which bundle is chosen, and whether the credit is still there to spend,
  // belong to the credit module — and are covered against a real database in
  // tests/integration/bundle-credits.test.ts. Here they are the answers the
  // route is wired to.
  const mockFindSpendableBundle = vi.fn();
  const mockSpendCredit = vi.fn();
  return {
    mockSelect,
    mockSelectFrom,
    mockSelectWhere,
    mockInnerJoin,
    mockLeftJoin,
    mockInsertValues,
    mockInsertReturning,
    mockInsert,
    mockUpdateWhere,
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdate,
    mockDeleteWhere,
    mockDelete,
    mockTransaction,
    mockSendBookingConfirmation,
    mockSendBookingNotification,
    mockAfter,
    mockFindSpendableBundle,
    mockSpendCredit,
  };
});

vi.mock("@/lib/bundles/credits", () => ({
  findSpendableBundle: mockFindSpendableBundle,
  spendCredit: mockSpendCredit,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bundles: {
    id: "id",
    customerEmail: "customer_email",
    status: "status",
    creditsRemaining: "credits_remaining",
    expiresAt: "expires_at",
  },
  bookings: {
    id: "id",
    scheduleId: "schedule_id",
    customerEmail: "customer_email",
    status: "status",
  },
  schedules: {
    id: "id",
    classId: "class_id",
    bookedCount: "booked_count",
    capacity: "capacity",
    status: "status",
    date: "date",
    startTime: "start_time",
    endTime: "end_time",
    location: "location",
  },
  classes: {
    id: "id",
    bundleEligible: "bundle_eligible",
    title: "title",
    priceInPence: "price_in_pence",
  },
  waitlistEntries: { id: "id", offerToken: "offer_token" },
}));

vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
  sendBookingNotification: mockSendBookingNotification,
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mockAfter };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}));

import { POST } from "@/app/api/book/redeem/route";

const SPENDABLE = {
  id: 10,
  customerEmail: "jane@example.com",
  creditsTotal: 6,
  creditsRemaining: 4,
  status: "active",
  expiresAt: new Date("2099-12-31"),
};

describe("POST /api/book/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockInnerJoin.mockReturnValue({ where: mockSelectWhere });
    mockLeftJoin.mockReturnValue({ where: mockSelectWhere });
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere,
      innerJoin: mockInnerJoin,
      leftJoin: mockLeftJoin,
    });
    mockSelectWhere.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsertReturning.mockResolvedValue([{ id: 1 }]);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockImplementation(() =>
      Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
    );
    mockUpdateReturning.mockResolvedValue([{ id: 1 }]);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          insert: mockInsert,
          update: mockUpdate,
          select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
        };
        return await fn(tx);
      },
    );
    mockFindSpendableBundle.mockResolvedValue(SPENDABLE);
    mockSpendCredit.mockResolvedValue({ spent: true, creditsRemaining: 3 });
  });

  it("returns 400 when required fields are missing", async () => {
    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 404 when the schedule does not exist", async () => {
    mockSelectWhere.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 999,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Schedule not found");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit on a class that is not bundle-eligible", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: false, status: "open" },
    ]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("This class cannot be booked with a bundle");

    // No credit spent, no booking created
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the customer has no bundle to spend from", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: true, status: "open" },
    ]);
    mockFindSpendableBundle.mockResolvedValue(null);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("No active bundle found");
  });

  it("returns 200 for valid bundle redemption", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.creditsRemaining).toBe(3);

    // Verify transaction was used for atomicity
    expect(mockTransaction).toHaveBeenCalledOnce();

    // Verify booking was inserted
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        bundleId: 10,
      }),
    );

    // One credit spent, from the bundle the read chose, inside the
    // transaction the booking was made in.
    expect(mockSpendCredit).toHaveBeenCalledTimes(1);
    expect(mockSpendCredit).toHaveBeenCalledWith(expect.anything(), 10);

    // Verify the seat was taken through the guarded claim
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ bookedCount: expect.anything() }),
    );
    expect(mockUpdateReturning).toHaveBeenCalled();
  });

  it("sends the confirmation at redemption time, not overnight", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([
        {
          bundleEligible: true,
          status: "open",
          date: "2099-06-20",
          startTime: "10:00:00",
          endTime: "11:00:00",
          location: "Studio 1, Hove",
          classTitle: "Prenatal Yoga",
          priceInPence: 1800,
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // An ordinary redemption used to send nothing at all: the customer heard
    // from us only if the overnight sweep happened to pick her booking up.
    expect(mockSendBookingConfirmation).toHaveBeenCalledWith({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2099-06-20",
      startTime: "10:00:00",
      endTime: "11:00:00",
      location: "Studio 1, Hove",
      payment: { method: "credit", creditsRemaining: 3 },
    });
    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "individual",
        payment: { method: "credit", creditsRemaining: 3 },
      }),
    );

    // And it is marked sent, so the sweep does not send it a second time. The
    // sending runs in `after()`, past the response, so let it settle first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockUpdateSet).toHaveBeenCalledWith({ emailSent: true });
  });

  it("returns 409 when customer already has a booking for this schedule", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([{ id: 99, status: "confirmed" }]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("You already have a booking for this class");

    // No booking should be created and no credit spent
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit on a cancelled class", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: true, status: "cancelled" },
    ]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is not available");

    // Nothing written: no booking, no credit spent, no occupancy change.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit on a class closed to bookings", async () => {
    // The bug this closes: a class Gabrielle had marked full by hand was still
    // redeemable, because `claimSeat` only ever looked at capacity. It now
    // refuses in the same statement that takes the seat, and this read is what
    // gives the customer the same message the card path gives.
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: true, status: "closed" },
    ]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Class is not available");

    // Nothing written: no booking, no credit spent, no occupancy change.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses a token for a class that has been cancelled", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: true, status: "cancelled" },
    ]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        offerToken: "a-token-for-a-class-that-is-not-happening",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Class is not available");

    // The class is refused before the token is even looked up: cancelling voided
    // the held seat, and nothing about the link can put it back.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit when the class has no places left", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([]);
    // The guarded claim matches no row when occupancy is already at capacity.
    mockUpdateReturning.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is full");

    // The refusal came from the claim's own UPDATE, so it is safe under a race.
    expect(mockUpdateReturning).toHaveBeenCalled();

    // No booking created and no credit spent — the only write attempted was the
    // guarded claim, which matched nothing.
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockSpendCredit).not.toHaveBeenCalled();
  });

  it("does not read occupancy ahead of the claim", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    await POST(request);

    // Capacity must never be decided from a value read before the claim: the
    // schedule lookup pulls status, bundle eligibility and the details the
    // confirmation email needs, nothing occupancy.
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "status",
        bundleEligible: "bundle_eligible",
      }),
    );
    expect(mockSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ bookedCount: expect.anything() }),
    );
    expect(mockSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ capacity: expect.anything() }),
    );
  });

  it("reports the balance the debit left, not one of its own arithmetic", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([]);
    // Whatever the row said when it was read, the answer is the number the
    // guarded debit actually wrote.
    mockSpendCredit.mockResolvedValue({ spent: true, creditsRemaining: 0 });

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.creditsRemaining).toBe(0);
  });

  it("refuses the booking when the credit is gone by the time it is spent", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([]);
    // Someone else spent the last credit between the read and the debit.
    mockSpendCredit.mockResolvedValue({ spent: false });

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "That bundle has no credits left",
    );

    // The refusal is thrown out of the transaction, which is what rolls the
    // seat and the booking back. What the rows look like afterwards is
    // tests/integration/book-redeem.test.ts.
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

describe("POST /api/book/redeem with an offer token", () => {
  const SCHEDULE = {
    bundleEligible: true,
    // Closed by hand — the seat being held for this person is why. The token
    // is exempt from that refusal, as it is on the card path.
    status: "closed",
    date: "2099-06-20",
    startTime: "10:00:00",
    endTime: "11:00:00",
    location: "Studio 1, Hove",
    classTitle: "Prenatal Yoga",
    priceInPence: 1800,
  };

  const HELD_BOOKING = { id: 77, status: "held" };

  function offerRow(overrides: Record<string, unknown> = {}) {
    return {
      entry: {
        id: 5,
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        offerToken: "tok",
        offerExpiresAt: new Date("2099-06-19T10:00:00Z"),
        heldBookingId: 77,
        ...overrides,
      },
      heldBookingStatus: "held",
    };
  }

  function redeemWithToken(token = "tok") {
    return new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        offerToken: token,
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockInnerJoin.mockReturnValue({ where: mockSelectWhere });
    mockLeftJoin.mockReturnValue({ where: mockSelectWhere });
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere,
      innerJoin: mockInnerJoin,
      leftJoin: mockLeftJoin,
    });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockImplementation(() =>
      Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
    );
    mockUpdateReturning.mockResolvedValue([{ id: 77 }]);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        await fn({
          insert: mockInsert,
          update: mockUpdate,
          delete: mockDelete,
          select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
        }),
    );
    mockFindSpendableBundle.mockResolvedValue(SPENDABLE);
    mockSpendCredit.mockResolvedValue({ spent: true, creditsRemaining: 3 });
    // schedule, existing bookings (the held seat), offer by token
    mockSelectWhere
      .mockResolvedValueOnce([SCHEDULE])
      .mockResolvedValueOnce([HELD_BOOKING])
      .mockResolvedValueOnce([offerRow()]);
  });

  it("converts the held seat instead of booking a second one", async () => {
    const response = await POST(redeemWithToken());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.creditsRemaining).toBe(3);

    // The held booking becomes the confirmed one; no second booking appears.
    expect(mockUpdateSet).toHaveBeenCalledWith({
      status: "confirmed",
      bundleId: 10,
    });
    expect(mockInsert).not.toHaveBeenCalled();

    // Occupancy must not move: the offer already counted this seat.
    expect(mockUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ bookedCount: expect.anything() }),
    );

    // Exactly one credit spent, from the bundle the read chose.
    expect(mockSpendCredit).toHaveBeenCalledTimes(1);
    expect(mockSpendCredit).toHaveBeenCalledWith(expect.anything(), 10);

    // Acceptance takes the waiting-list entry with it, and the customer gets
    // the booking confirmation — for the credit she spent, not the list price
    // she did not pay. Asserted in full: an `objectContaining` that omits the
    // payment is how a cash price went out on a credit booking unnoticed.
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSendBookingConfirmation).toHaveBeenCalledWith({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2099-06-20",
      startTime: "10:00:00",
      endTime: "11:00:00",
      location: "Studio 1, Hove",
      payment: { method: "credit", creditsRemaining: 3 },
    });
  });

  it("tells Gabrielle the seat went to a credit, not to a payment", async () => {
    await POST(redeemWithToken());

    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "individual",
        customerEmail: "jane@example.com",
        classTitle: "Prenatal Yoga",
        payment: { method: "credit", creditsRemaining: 3 },
      }),
    );
  });

  it("is not refused as already booked because of the seat held for them", async () => {
    const response = await POST(redeemWithToken());
    expect(response.status).toBe(200);
  });

  it("refuses an expired offer", async () => {
    mockSelectWhere.mockReset();
    mockSelectWhere
      .mockResolvedValueOnce([SCHEDULE])
      .mockResolvedValueOnce([HELD_BOOKING])
      .mockResolvedValueOnce([
        {
          ...offerRow(),
          entry: {
            ...offerRow().entry,
            offerExpiresAt: new Date("2020-01-01T00:00:00Z"),
          },
        },
      ]);

    const response = await POST(redeemWithToken());
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error).toBe("This offer has expired");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses a token that matches no offer", async () => {
    mockSelectWhere.mockReset();
    mockSelectWhere
      .mockResolvedValueOnce([SCHEDULE])
      .mockResolvedValueOnce([HELD_BOOKING])
      .mockResolvedValueOnce([]);

    const response = await POST(redeemWithToken("not-a-token"));
    expect(response.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("reports an offer taken up between the read and the write", async () => {
    // The guarded conversion matched nothing: the seat is no longer held.
    mockUpdateReturning.mockResolvedValue([]);

    const response = await POST(redeemWithToken());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("This offer has already been taken up");

    // No credit spent and the waiting-list entry left alone.
    expect(mockSpendCredit).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
