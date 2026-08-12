import Link from "next/link";
import { ShieldCheck, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { PRONTIDAO_LABEL, PRONTIDAO_ACAO } from "@/modules/projetos/prontidao";
import type { DisciplinaPronta } from "@/modules/projetos/queries";

/**
 * Fila de CONCLUSÃO: disciplinas que já cumpriram tudo e só esperam alguém aprovar.
 * Complementa a fila de arquivos (`AprovacoesView`), que é um passo antes — lá se valida
 * arquivo a arquivo, aqui se fecha a disciplina. Server Component: só leitura + links.
 */
export function ProntasAprovacaoView({ prontas }: { prontas: DisciplinaPronta[] }) {
  if (prontas.length === 0) {
    return (
      <div className="rounded-sm border">
        <EmptyState
          icon={ShieldCheck}
          title="Nenhuma disciplina pronta"
          description="Quando uma entrega tiver todos os arquivos validados (ou o responsável marcar o projeto como aprovado), ela aparece aqui."
        />
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-sm border">
      {prontas.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <Link href={d.href} className="font-medium hover:underline">
            {d.nome}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">
            {formatarCodigo(d.projetoCodigo)}
          </span>
          <span className="truncate text-xs text-muted-foreground" title={d.projetoNome}>
            {d.projetoNome}
          </span>
          <Badge
            variant="outline"
            className={
              d.prontidao === "pronta_validacao"
                ? "ml-auto shrink-0 gap-1 border-status-aprovado/40 bg-status-aprovado/10 text-[10px] text-status-aprovado"
                : "ml-auto shrink-0 gap-1 border-status-entregue/40 bg-status-entregue/10 text-[10px] text-status-entregue"
            }
          >
            {d.prontidao === "pronta_validacao" ? (
              <ShieldCheck className="size-3" aria-hidden />
            ) : (
              <Clock className="size-3" aria-hidden />
            )}
            {PRONTIDAO_LABEL[d.prontidao]}
          </Badge>
          <p className="w-full text-xs text-muted-foreground">{PRONTIDAO_ACAO[d.prontidao]}</p>
        </li>
      ))}
    </ul>
  );
}
