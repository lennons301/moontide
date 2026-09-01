import { eq } from "drizzle-orm";
import { ADMIN_ROLE, createAuth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { user } from "../src/lib/db/auth-schema";

const EMAIL = "gwaring5@googlemail.com";

// Sign-up is off on the mounted auth instance, so this script gets its own
// with sign-up enabled — it runs against the database directly and is the only
// way an account is created.
const seedAuth = createAuth({ allowSignUp: true });

function isAlreadyRegistered(error: unknown) {
  const code = (error as { body?: { code?: string } })?.body?.code;
  if (typeof code === "string") return code.startsWith("USER_ALREADY_EXISTS");
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("already exists");
}

async function seedAdmin() {
  console.log("Creating admin user...");

  try {
    await seedAuth.api.signUpEmail({
      body: {
        email: EMAIL,
        password: process.env.ADMIN_PASSWORD || "changeme123",
        name: "Gabrielle",
      },
    });
    console.log(`Admin user created: ${EMAIL}`);
  } catch (error) {
    if (!isAlreadyRegistered(error)) throw error;
    console.log(`Admin user already exists: ${EMAIL}`);
  }

  // The role is not settable through sign-up (`input: false`), so grant it
  // here — without it the login works and the proxy still refuses.
  const promoted = await db
    .update(user)
    .set({ role: ADMIN_ROLE })
    .where(eq(user.email, EMAIL))
    .returning({ id: user.id });

  if (promoted.length === 0) {
    throw new Error(`No user row for ${EMAIL} to grant the admin role to`);
  }

  console.log(`Admin role granted: ${EMAIL}`);
  process.exit(0);
}

seedAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
