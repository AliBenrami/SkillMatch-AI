import { getSessionUser } from "@/lib/auth";
import Dashboard from "./dashboard";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <Dashboard
      user={user}
      enableE2eFileHook={
        process.env.NEXT_PUBLIC_SKILLMATCH_E2E_FILE_HOOK === "1" || process.env.E2E_DISABLE_DATABASE === "1"
      }
    />
  );
}
