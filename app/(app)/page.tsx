import { redirect } from "next/navigation";

// Everyone lands on the Dashboard. It's role-aware: MIS staff/admin get the full
// operational dashboard; employees get their own "your issues & requests" view
// (app/(app)/dashboard/page.tsx branches on role). Middleware sends an unauthenticated
// visitor to /login before this runs.
export default async function Home() {
  redirect("/dashboard");
}
