import { getSessionUser } from "@/lib/auth";
import Dashboard from "./dashboard";
import { redirect } from "next/navigation";

type HomeProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  const params = await searchParams;
  const view = Array.isArray(params?.view) ? params.view[0] : params?.view;

  return (
    <Dashboard
      user={user}
      initialView={view}
      enableE2eFileHook={
        process.env.NEXT_PUBLIC_SKILLMATCH_E2E_FILE_HOOK === "1" || process.env.E2E_DISABLE_DATABASE === "1"
      }
    />
  );
}
