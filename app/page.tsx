import { getSessionUser } from "@/lib/auth";
import Dashboard from "./dashboard";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <Dashboard user={user} />;
}
