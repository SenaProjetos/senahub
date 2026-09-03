import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { detalheSecao } from "@/modules/auditoria/queries";
import { moduloLabel } from "@/modules/auditoria/labels";
import { DetalheSecaoView } from "@/components/auditoria/detalhe-secao-view";

export const metadata: Metadata = { title: "Uso da seção" };

const PERIODOS = [7, 14, 30, 90];

export default async function SecaoUsoPage({
  params,
  searchParams,
}: {
  params: Promise<{ secao: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  // `auditoria:ver` em vez de `requireRole("admin")` (F2 de
  // docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md): o par já existia no
  // catálogo e governava só o item de menu. Sem mudança de acesso — ninguém tem `auditoria:ver`
  // na semente, e o admin continua passando pelo bypass de `superUsuario`.
  await requirePermission("auditoria", "ver");
  const { secao } = await params;
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 14;
  const d = await detalheSecao(secao, dias);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/auditoria/uso?dias=${dias}`}
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Uso por seção
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">{moduloLabel(secao)}</h2>
        <p className="text-sm text-muted-foreground">Detalhe de uso nos últimos {dias} dias.</p>
      </div>
      <DetalheSecaoView d={d} />
    </div>
  );
}
