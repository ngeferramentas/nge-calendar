import { listClients } from "@/app/actions/clients";
import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ClientesAdmin } from "@/components/clientes-admin";

export default async function ClientesPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");
  if (ctx.profile.role !== "admin") redirect("/agenda");

  const res = await listClients();
  const rows = res.ok ? res.data ?? [] : [];

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-zinc-900">Clientes</h2>
      <ClientesAdmin initialClients={rows} />
    </div>
  );
}
