/**
 * Remove seeded demo/test data — the @example.com users and every ticket they
 * created (comments, attachments, activity, and notifications cascade). Real
 * users (who signed in via Google) and their tickets are never touched.
 *
 * Run with:  npm run db:clean
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}
const sql = neon(process.env.DATABASE_URL);

async function main() {
  const [{ n: ticketsBefore }] = await sql`select count(*)::int n from tickets`;
  const [{ n: usersBefore }] = await sql`select count(*)::int n from users`;
  console.log(`before → tickets: ${ticketsBefore}, users: ${usersBefore}`);

  await sql`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@example.com')`;
  await sql`DELETE FROM tickets WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@example.com')`;
  await sql`DELETE FROM users WHERE email LIKE '%@example.com'`;

  const [{ n: ticketsAfter }] = await sql`select count(*)::int n from tickets`;
  const [{ n: usersAfter }] = await sql`select count(*)::int n from users`;

  // If no tickets remain at all, restart numbering so the first real ticket is MIS-1001.
  if (ticketsAfter === 0) {
    await sql`ALTER SEQUENCE ticket_seq RESTART WITH 1001`;
    console.log("ticket_seq reset → next ticket will be MIS-1001");
  }

  console.log(`after  → tickets: ${ticketsAfter}, users: ${usersAfter}`);
  console.log("✓ test data removed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
