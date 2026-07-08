import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";

// Role-aware landing: employees → My Tickets, MIS staff/admin → Dashboard.
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user && user.role !== "USER" ? "/dashboard" : "/my");
}
