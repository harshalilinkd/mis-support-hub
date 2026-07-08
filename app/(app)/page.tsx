import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// Role-aware landing: employees → My Tickets, MIS staff/admin → Dashboard.
export default async function Home() {
  const session = await auth();
  const role = session?.user?.role ?? "USER";
  redirect(role === "USER" ? "/my" : "/dashboard");
}
