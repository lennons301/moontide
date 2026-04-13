import { auth } from "../src/lib/auth";

async function seedAdmin() {
  console.log("Creating admin user...");

  await auth.api.signUpEmail({
    body: {
      email: "gwaring5@googlemail.com",
      password: process.env.ADMIN_PASSWORD || "changeme123",
      name: "Gabrielle",
    },
  });

  console.log("Admin user created: gwaring5@googlemail.com");
}

seedAdmin().catch(console.error);
