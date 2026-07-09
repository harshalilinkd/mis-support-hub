import { redirect } from "next/navigation";

/** /settings has a single section for now — send it to the users screen. */
export default function SettingsPage() {
  redirect("/settings/users");
}
