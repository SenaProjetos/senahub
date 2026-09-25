"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { FaseAAprovar } from "@/modules/projetos/queries";
import { AprovarFaseButton } from "@/components/projetos/aprovar-fase-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatarData } from "@/lib/utils";

/**
 * Fila de FASES a aprovar (L3): cada linha é uma fase de disciplina já entregue, esperando a aprovação
 * que libera o pagamento dela. Quem tem `aprovacoes:disciplina` aprova daqui — a mesma
 * `aprovarEtapaDisciplina` do diálogo Etapas —; sem a permissão, a fila é só consulta, com o atalho
 * para o projeto.
 */
export function FasesAAprovarView({ fases, podeAprovar }: { fases: FaseAAprovar[]; podeAprovar: boolean }) {
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
            {podeAprovar && <AprovarFaseButton faseId={f.id} sigla={f.sigla} disciplina={f.disciplina} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
