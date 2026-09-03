import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarAuditoria } from "@/modules/auditoria/queries";
import { AuditoriaTabela } from "@/components/auditoria/auditoria-tabela";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    modulo?: string;
    resultado?: string;
    q?: string;
    de?: string;
    ate?: string;
    page?: string;
  }>;
}) {
  // `auditoria:ver` em vez de `requireRole("admin")` (F2 de
  // docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md): o par já existia no
  // catálogo e governava só o item de menu. Sem mudança de acesso — ninguém tem `auditoria:ver`
  // na semente, e o admin continua passando pelo bypass de `superUsuario`.
  await requirePermission("auditoria", "ver");
  const sp = await searchParams;

  const data = await listarAuditoria({
    modulo: sp.modulo,
    resultado: sp.resultado,
    q: sp.q,
    de: sp.de,
    ate: sp.ate,
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
