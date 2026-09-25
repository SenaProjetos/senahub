"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { aprovarEtapaDisciplina } from "@/modules/projetos/etapas-actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { FaseAAprovar } from "@/modules/projetos/queries";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarData } from "@/lib/utils";

/**
 * Fila de FASES a aprovar (L3): cada linha é uma fase de disciplina já entregue, esperando a aprovação
 * que libera o pagamento dela. Quem tem `aprovacoes:disciplina` aprova daqui — a mesma
 * `aprovarEtapaDisciplina` do diálogo Etapas —; sem a permissão, a fila é só consulta, com o atalho
 * para o projeto.
 */
export function FasesAAprovarView({ fases, podeAprovar }: { fases: FaseAAprovar[]; podeAprovar: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  // O confirm vem ANTES do start: dentro da transition o setState do diálogo suspende e trava a tela.
  async function aprovar(f: FaseAAprovar) {
    const ok = await confirm({
      title: `Aprovar a fase ${f.sigla} de ${f.disciplina}?`,
      description:
        "Libera o pagamento desta fase para os projetistas PJ/freelancer da disciplina. Depois disso o percentual da fase fica fixo e ela não pode mais ser removida.",
      confirmLabel: "Aprovar fase",
    });
    if (!ok) return;
    start(async () => {
      const r = await aprovarEtapaDisciplina({ id: f.id });
      if (r.ok) {
        toast.success(
          r.data.pagamentos > 0 ? `Fase ${f.sigla} aprovada — pagamento liberado.` : `Fase ${f.sigla} aprovada.`,
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <ul className="divide-y rounded-sm border">
      {fases.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Link href={f.href} className="font-medium hover:underline">
            {f.disciplina} · {f.sigla}
          </Link>
          <span className="text-xs text-muted-foreground">{f.nomeFase} · {f.percentual}%</span>
          <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(f.projetoCodigo)}</span>
          <span className="truncate text-xs text-muted-foreground" title={f.projetoNome}>
            {f.projetoNome}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {f.prazo && <span className="font-mono text-xs text-muted-foreground">prazo {formatarData(f.prazo)}</span>}
            <StatusBadge tone={f.status === "entregue" ? "info" : "warning"}>
              {f.status === "entregue" ? "Entregue" : "Em revisão"}
            </StatusBadge>
            {podeAprovar && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void aprovar(f)}>
                Aprovar
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
