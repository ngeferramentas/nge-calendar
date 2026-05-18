import { listClients } from "@/app/actions/clients";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader title="Clientes" />
      <ClientesAdmin initialClients={rows} />
    </div>
  );
}
