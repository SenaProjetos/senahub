import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarAuditoria } from "@/modules/auditoria/queries";
import { AuditoriaTabela } from "@/components/auditoria/auditoria-tabela";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ modulo?: string; resultado?: string; q?: string; page?: string }>;
}) {
  await requireRole("admin");
  const sp = await searchParams;

  const data = await listarAuditoria({
    modulo: sp.modulo,
    resultado: sp.resultado,
    q: sp.q,
    page: sp.page ? Number(sp.page) : 1,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Auditoria</h2>
        <p className="text-sm text-muted-foreground">
          Registro imutável de toda atividade do sistema. {data.total} eventos.
        </p>
      </div>
      <AuditoriaTabela data={data} filtro={sp} />
    </div>
  );
}
