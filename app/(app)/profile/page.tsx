import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { getUserById } from "@/lib/db/queries";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata: Metadata = { title: "Profile" };

const MEMBER_SINCE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function ProfilePage() {
  const session = await requireUser();
  const user = await getUserById(session.id);
  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your account and preferences." />
      <ProfileForm
        name={user.name ?? ""}
        email={user.email}
        role={user.role}
        image={user.image}
        department={user.department}
        memberSince={MEMBER_SINCE_FMT.format(new Date(user.createdAt))}
        hasPassword={!!user.passwordHash}
      />
    </div>
  );
}
