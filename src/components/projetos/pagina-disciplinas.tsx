"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { AdicionarDisciplinaButton } from "@/components/projetos/adicionar-disciplina-button";
import { AdicionarDoCatalogoButton } from "@/components/projetos/adicionar-do-catalogo-button";
import { ACAO_PAGINA_DISCIPLINAS, PREFIXO_MOSTRAR, itensDaPaginaDisciplinas } from "@/modules/projetos/acoes-disciplina";
import { ORDEM_STATUS_DISCIPLINA } from "@/modules/projetos/ordem-disciplinas";
import { STATUS_LABEL } from "@/modules/projetos/status";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

const PONTO_STATUS: Record<StatusDisciplina, string> = {
  aguardando: "bg-status-aguardando",
  em_andamento: "bg-status-andamento",
  em_revisao: "bg-status-revisao",
  entregue: "bg-status-entregue",
  aprovado: "bg-status-aprovado",
};

type Catalogo = React.ComponentProps<typeof AdicionarDoCatalogoButton>["catalogo"];

/**
 * Moldura da página Disciplinas (redesenho de 2026-09-29): cabeçalho, busca, filtro por status
 * (substitui o resumo do kanban, que saiu) e o botão direito no espaço vazio da página — com
 * adicionar e filtrar (emenda do ADR-0002). O mesmo array alimenta esse menu e o ⋯ do
 * cabeçalho. Os cards (`children`) têm o menu deles, que ganha do da página.
 *
 * As duas janelas de adicionar moram aqui, uma vez só: abrem pelo botão, pelo ⋯ e pelo menu.
 */
export function PaginaDisciplinas({
  projetoId,
  podeGerir,
  internos,
  prazoContrato,
  catalogo,
  filtro,
  contagem,
  total,
  children,
}: {
  projetoId: string;
  podeGerir: boolean;
  internos: { id: string; name: string }[];
  prazoContrato: string | null;
  catalogo: Catalogo;
  filtro: StatusDisciplina | null;
  contagem: Record<StatusDisciplina, number>;
  total: number;
  children: ReactNode;
}) {
  const setParams = useSetParams();
  const [janela, setJanela] = useState<"adicionar" | "catalogo" | null>(null);
  const itens = itensDaPaginaDisciplinas({ podeGerir, temCatalogo: catalogo.length > 0, filtro, contagem, total });

  function aoSelecionar(item: AcaoItemAcao) {
    if (item.id === ACAO_PAGINA_DISCIPLINAS.adicionar || item.id === ACAO_PAGINA_DISCIPLINAS.catalogo) {
      setJanela(item.id);
      return;
    }
    if (item.id.startsWith(PREFIXO_MOSTRAR)) {
      const s = item.id.slice(PREFIXO_MOSTRAR.length);
      setParams({ status: s === "todas" ? null : s });
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={<div className="min-h-[calc(100svh-11rem)] space-y-4 pb-6" />}>
          {/* Celular: sem a descrição e com o "+" só em ícone — título e ações numa linha só. */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight">Disciplinas</h2>
              <p className="text-sm text-muted-foreground max-sm:hidden">Entregas, arquivos, revisões e responsáveis de cada disciplina.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {podeGerir && (
                <Button size="sm" onClick={() => setJanela("adicionar")} aria-label="Adicionar disciplina" title="Adicionar disciplina">
                  <Plus className="size-4" /> <span className="max-sm:hidden">Adicionar disciplina</span>
                </Button>
              )}
              <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo="Mais ações da página" className="size-8" />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <BuscaDisciplina />
            {/* Celular: uma linha só, que rola para o lado — em duas linhas os filtros empurravam
                os cards para baixo da dobra. */}
            <div
              role="group"
              aria-label="Filtrar por status"
              className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
            >
              <Chip ativo={filtro === null} onClick={() => setParams({ status: null })} rotulo="Todas" total={total} />
              {ORDEM_STATUS_DISCIPLINA.map((s) => (
                <Chip
                  key={s}
                  ativo={filtro === s}
                  onClick={() => setParams({ status: filtro === s ? null : s })}
                  rotulo={STATUS_LABEL[s]}
                  total={contagem[s] ?? 0}
                  ponto={PONTO_STATUS[s]}
                />
              ))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground max-sm:hidden">Ordem: status e prazo</span>
          </div>

          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <AcoesMenuItens itens={itens} onSelect={aoSelecionar} />
        </ContextMenuContent>
      </ContextMenu>

      {podeGerir && (
        <AdicionarDisciplinaButton
          projetoId={projetoId}
          internos={internos}
          prazoContrato={prazoContrato}
          controle={{ aberto: janela === "adicionar", aoMudar: (v) => setJanela(v ? "adicionar" : null) }}
        />
      )}
      {podeGerir && catalogo.length > 0 && (
        <AdicionarDoCatalogoButton
          projetoId={projetoId}
          catalogo={catalogo}
          controle={{ aberto: janela === "catalogo", aoMudar: (v) => setJanela(v ? "catalogo" : null) }}
        />
      )}
    </>
  );
}

function Chip({
  ativo,
  onClick,
  rotulo,
  total,
  ponto,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  total: number;
  ponto?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-9",
        ativo ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card hover:bg-accent",
      )}
    >
      {ponto && <span aria-hidden className={cn("size-2 rounded-full", ponto)} />}
      {rotulo}
      <span className={cn("font-mono text-[11px]", ativo ? "opacity-80" : "text-muted-foreground")}>{total}</span>
    </button>
  );
}

/** Busca por nome ou responsável — vai para a URL (`?q=`) com uma pausa curta, sem empilhar histórico. */
function BuscaDisciplina() {
  const setParams = useSetParams();
  const q = useSearchParams().get("q") ?? "";
  const [texto, setTexto] = useState(q);
  useEffect(() => {
    if (texto.trim() === q.trim()) return;
    const t = setTimeout(() => setParams({ q: texto.trim() || null }, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [texto, q, setParams]);
  return (
    <label className="relative flex w-full items-center sm:w-auto">
      <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar disciplina ou responsável"
        aria-label="Buscar disciplina ou responsável"
        className="h-8 w-full rounded-sm border bg-card pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
      />
    </label>
  );
}
