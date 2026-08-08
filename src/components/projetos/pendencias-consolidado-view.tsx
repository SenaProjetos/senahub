"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FAIXA_LABEL, FAIXA_COR, FAIXAS_AGING } from "@/lib/aging";
import type { ItemConsolidado } from "@/modules/projetos/pendencias/queries";
import {
  pesoSeveridade,
  SEVERIDADES,
  SEVERIDADE_LABEL,
  TIPO_PENDENCIA_LABEL,
  type Severidade,
  type TipoPendencia,
} from "@/modules/projetos/pendencias/helpers";
import { cn, formatarData } from "@/lib/utils";

/** Mesma escala de cor do viewer — só o impeditivo é sólido (é o que trava aprovação). */
const SEVERIDADE_CLS: Record<Severidade, string> = {
  impeditivo: "border-transparent bg-destructive text-white",
  alta: "text-destructive border-destructive/40",
  media: "text-warning border-warning/40",
  baixa: "text-muted-foreground border-muted",
};

type Agrupamento = "projeto" | "disciplina" | "responsavel";

const SEM_RESPONSAVEL = "— Sem responsável —";

function chaveGrupo(item: ItemConsolidado, por: Agrupamento): string[] {
  if (por === "projeto") return [`${item.projetoCodigo} — ${item.projetoNome}`];
  if (por === "disciplina") return [`${item.projetoCodigo} · ${item.disciplinaNome}`];
  return item.responsaveis.length > 0 ? item.responsaveis : [SEM_RESPONSAVEL];
}

/** Visão consolidada de apontamentos abertos (item 16) — filtra e agrupa client-side. */
export function PendenciasConsolidadoView({ itens }: { itens: ItemConsolidado[] }) {
  const [projetoFiltro, setProjetoFiltro] = useState<string>("todos");
  const [faixaFiltro, setFaixaFiltro] = useState<string>("todas");
  const [severidadeFiltro, setSeveridadeFiltro] = useState<string>("todas");
  const [agrupar, setAgrupar] = useState<Agrupamento>("projeto");

  const projetos = useMemo(() => {
    const mapa = new Map(itens.map((i) => [i.projetoId, `${i.projetoCodigo} — ${i.projetoNome}`]));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [itens]);

  const filtrados = useMemo(
    () =>
      itens.filter(
        (i) =>
          (projetoFiltro === "todos" || i.projetoId === projetoFiltro) &&
          (faixaFiltro === "todas" || i.faixa === faixaFiltro) &&
          (severidadeFiltro === "todas" ||
            (severidadeFiltro === "sem" ? !i.severidade : i.severidade === severidadeFiltro)),
      ),
    [itens, projetoFiltro, faixaFiltro, severidadeFiltro],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemConsolidado[]>();
    for (const item of filtrados) {
      for (const chave of chaveGrupo(item, agrupar)) {
        const lista = mapa.get(chave);
        if (lista) lista.push(item);
        else mapa.set(chave, [item]);
      }
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados, agrupar]);

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nenhum apontamento aberto"
        description="Não há apontamentos abertos nos projetos visíveis para você."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={agrupar} onValueChange={(v) => setAgrupar((v as Agrupamento) ?? "projeto")}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="projeto">Agrupar por projeto</SelectItem>
            <SelectItem value="disciplina">Agrupar por disciplina</SelectItem>
            <SelectItem value="responsavel">Agrupar por responsável</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projetoFiltro} onValueChange={(v) => setProjetoFiltro(v ?? "todos")}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os projetos</SelectItem>
            {projetos.map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={faixaFiltro} onValueChange={(v) => setFaixaFiltro(v ?? "todas")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todo tempo em aberto</SelectItem>
            {FAIXAS_AGING.map((f) => (
              <SelectItem key={f} value={f}>{FAIXA_LABEL[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severidadeFiltro} onValueChange={(v) => setSeveridadeFiltro(v ?? "todas")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda severidade</SelectItem>
            {SEVERIDADES.map((s) => (
              <SelectItem key={s} value={s}>{SEVERIDADE_LABEL[s]}</SelectItem>
            ))}
            <SelectItem value="sem">Não classificados</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto">{filtrados.length} apontamento(s)</Badge>
      </div>

      {grupos.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum apontamento com esse filtro" />
      ) : (
        <div className="space-y-5">
          {grupos.map(([chave, lista]) => (
            <div key={chave} className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                <span className="text-sm font-semibold">{chave}</span>
                <Badge variant="outline" className="text-xs">{lista.length}</Badge>
              </div>
              <ul className="divide-y">
                {lista
                  .slice()
                  // Gravidade manda na triagem; entre iguais, o mais antigo primeiro.
                  .sort((a, b) => pesoSeveridade(a.severidade) - pesoSeveridade(b.severidade) || b.diasAbertos - a.diasAbertos)
                  .map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <span className={cnDot(item.faixa)} title={FAIXA_LABEL[item.faixa]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/projetos/${item.projetoId}/arquivos`} className="font-medium hover:underline">
                            #{item.numero}
                          </Link>
                          {item.severidade && (
                            <Badge
                              variant="outline"
                              className={cn("h-5 px-1.5 text-[10px]", SEVERIDADE_CLS[item.severidade as Severidade])}
                            >
                              {SEVERIDADE_LABEL[item.severidade as Severidade] ?? item.severidade}
                            </Badge>
                          )}
                          {item.tipo && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                              {TIPO_PENDENCIA_LABEL[item.tipo as TipoPendencia] ?? item.tipo}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {item.projetoCodigo} · {item.disciplinaNome} · pág. {item.pagina}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{item.texto}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <div className="text-muted-foreground">{formatarData(item.createdAt)}</div>
                        <div className="font-medium">{item.diasAbertos}d aberto</div>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function cnDot(faixa: ItemConsolidado["faixa"]) {
  return `mt-1.5 size-2 shrink-0 rounded-full ${FAIXA_COR[faixa]}`;
}
