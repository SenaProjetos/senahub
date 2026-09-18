"use client";

import { useState, useTransition, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, CheckCircle2, Download, FileText } from "lucide-react";
import type { TipoAtividade, TipoProximaAcao } from "@/generated/prisma/client";
import { aceitarProposta, concluirProximaAcao } from "@/modules/comercial/actions";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import { TIPO_ATIVIDADE_LABEL, opcoesDe } from "@/modules/comercial/labels";
import { ATIVIDADE_ICONE } from "@/components/comercial/atividade-icones";
import { FollowUpDialog } from "./follow-up-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Timeline } from "@/components/ui/timeline";
import { brl, formatarDataHora } from "@/lib/utils";

export type AcaoAberta = {
  id: string;
  tipo: TipoProximaAcao | null;
  titulo: string;
  inicio: string;
  local: string | null;
  criador: string | null;
};

export type PropostaFicha = {
  id: string;
  numero: string;
  titulo: string;
  status: string;
  externa: boolean;
  versao: number | null;
  temPdf: boolean;
  valorOriginal: number | null;
  desconto: number | null;
  valorVersao: number | null;
};

export type ItemTimelineFicha = {
  id: string;
  nota: string;
  createdAt: string;
  autor: { name: string | null } | null;
  tipo: TipoAtividade;
};

const TIPOS_FILTRO_TIMELINE = opcoesDe(TIPO_ATIVIDADE_LABEL).map((o) => ({ value: o.value, label: o.label }));

export function Linha({
  icon: Icon,
  label,
  valor,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  valor: string | null | undefined;
}) {
  if (!valor) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="shrink-0 text-xs text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate">{valor}</span>
    </div>
  );
}

/**
 * Follow-ups em aberto + agendar. Concluir remonta o `FollowUpDialog` já aberto — "sugere a
 * próxima sem sair da tela" (F2.11), o mesmo comportamento da página do lead.
 */
export function FollowUpsFicha({
  entidadeTipo,
  entidadeId,
  nome,
  email,
  acoes,
}: {
  entidadeTipo: "LEAD" | "NEGOCIACAO";
  entidadeId: string;
  nome: string;
  email?: string | null;
  acoes: AcaoAberta[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sugerir, setSugerir] = useState(0);

  function concluir(compromissoId: string) {
    start(async () => {
      const r = await concluirProximaAcao({ compromissoId });
      if (r.ok) {
        toast.success("Ação concluída.");
        setSugerir((n) => n + 1);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <FollowUpDialog
          key={sugerir}
          entidadeTipo={entidadeTipo}
          leadId={entidadeId}
          leadNome={nome}
          leadEmail={email}
          iniciarAberto={sugerir > 0}
        />
      </div>
      {acoes.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nenhuma ação marcada" description="Agende o próximo contato." />
      ) : (
        acoes.map((a) => (
          <div key={a.id} className="flex items-start gap-2 rounded-sm border p-2 text-sm">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{a.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {a.tipo ? TIPO_PROXIMA_ACAO_LABEL[a.tipo] : "Ação"} · {formatarDataHora(a.inicio)}
                {a.local ? ` · ${a.local}` : ""}
                {a.criador ? ` · por ${a.criador}` : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => concluir(a.id)}>
              <Check className="size-3.5" /> Concluir
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Propostas com o valor e o desconto da versão vigente — é de lá que o valor do negócio sai.
 * Proposta externa (ADR-0005) não abre o editor: o documento é o PDF, e o aceite é feito aqui.
 */
export function PropostasFicha({
  propostas,
  podeGerir,
  acoesExtras,
}: {
  propostas: PropostaFicha[];
  podeGerir?: boolean;
  acoesExtras?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {acoesExtras && <div className="flex justify-end">{acoesExtras}</div>}
      {propostas.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhuma proposta" description="Registre ou crie a primeira proposta." />
      ) : (
        <div className="space-y-1.5">
          {propostas.map((p) => (
            <LinhaProposta key={p.id} p={p} podeGerir={podeGerir ?? false} />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaProposta({ p, podeGerir }: { p: PropostaFicha; podeGerir: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  async function aceitar() {
    // Confirma ANTES do start(): `await confirm()` dentro de startTransition trava no React 19.
    const ok = await confirm({
      title: `Aceitar ${p.numero}?`,
      description: "Cria o projeto com as disciplinas e o valor desta versão, e marca a negociação como contratada.",
      confirmLabel: "Aceitar e criar projeto",
    });
    if (!ok) return;
    start(async () => {
      const r = await aceitarProposta({ id: p.id });
      if (r.ok) {
        toast.success("Proposta aceita — projeto criado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const corpo = (
    <>
      <FileText className="size-3.5 text-muted-foreground" />
      <span className="font-mono text-xs">{p.numero}</span>
      {p.versao != null && <span className="font-mono text-[10px] text-muted-foreground">v{p.versao}</span>}
      <span className="min-w-0 flex-1 truncate">{p.titulo}</span>
      {p.externa && (
        <Badge variant="secondary" className="text-[10px]">
          Externa
        </Badge>
      )}
      {p.valorVersao != null && <span className="font-mono text-xs">{brl(p.valorVersao)}</span>}
      {p.desconto != null && p.desconto > 0 && (
        <span className="font-mono text-[10px] text-muted-foreground">desc. {brl(p.desconto)}</span>
      )}
      <Badge variant="outline" className="text-[10px]">
        {p.status}
      </Badge>
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border px-2 py-1.5 text-sm">
      {p.externa ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">{corpo}</div>
      ) : (
        <Link
          href={`/comercial/propostas/${p.id}`}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 hover:underline"
        >
          {corpo}
        </Link>
      )}
      {p.temPdf && p.versao != null && (
        <Button
          size="sm"
          variant="ghost"
          render={<a href={`/api/comercial/propostas/${p.id}/versoes/${p.versao}/pdf`} target="_blank" rel="noopener" />}
        >
          <Download className="size-3.5" /> PDF
        </Button>
      )}
      {p.externa && podeGerir && p.status !== "aceita" && (
        <Button size="sm" variant="outline" onClick={aceitar} disabled={pending}>
          <CheckCircle2 className="size-3.5" /> Aceitar → projeto
        </Button>
      )}
    </div>
  );
}

export function HistoricoFicha({ timeline }: { timeline: ItemTimelineFicha[] }) {
  return (
    <Timeline
      eventos={timeline.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        descricao: a.nota,
        createdAt: a.createdAt,
        autor: a.autor?.name ?? null,
        icone: ATIVIDADE_ICONE[a.tipo],
      }))}
      tipos={TIPOS_FILTRO_TIMELINE}
      vazioTitulo="Nenhuma atividade registrada"
    />
  );
}
