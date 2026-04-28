import { getSessionContext } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getSessionContext();
  if (ctx) redirect("/agenda");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <LoginForm />
    </div>
  );
}
