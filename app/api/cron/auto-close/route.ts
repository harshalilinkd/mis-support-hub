import { NextResponse } from "next/server";

import { autoCloseStaleTickets } from "@/lib/db/queries";
import { sendAutoCloseNotification } from "@/lib/notifications";

// Runs the §5 auto-close sweep. Triggered daily by Vercel Cron (see vercel.json);
// Vercel automatically sends `Authorization: Bearer $CRON_SECRET`. The route REFUSES
// unless CRON_SECRET is set and matches, so it can't be triggered by a stranger and
// degrades safe (does nothing) if the secret isn't configured. Any scheduler that can
// send that header works — Vercel Cron is just the default.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const closed = await autoCloseStaleTickets();
  // Notify each reporter best-effort — a failed send never blocks or reverses the sweep.
  await Promise.allSettled(closed.map((t) => sendAutoCloseNotification(t.id)));

  return NextResponse.json({
    ok: true,
    closed: closed.length,
    numbers: closed.map((t) => t.number),
  });
}

// Vercel Cron issues a GET; POST is accepted too for manual/other schedulers.
export const GET = run;
export const POST = run;
