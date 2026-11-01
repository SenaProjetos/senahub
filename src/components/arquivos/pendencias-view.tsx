"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { MotivoDialog } from "@/components/rh/motivo-dialog";
import { formatarDataHora } from "@/lib/utils";
import { useSetParams } from "@/lib/use-set-param";
import { desfazerDispensaPendencia, dispensarPendencia } from "@/modules/uploads/ciclo/pendencias-actions";
import { itensDaSelecaoDePendencias, itensDePendenciaCiclo, linksDaPendencia } from "@/modules/uploads/ciclo/acoes-pendencia";
import { GUIA_DOS_TIPOS, guiaDaPendencia } from "@/modules/uploads/ciclo/guia-pendencia";
import { contarPendencias, filtrarPendencias } from "@/modules/uploads/ciclo/pendencias-filtro";
import { ROTULO_PENDENCIA, type TipoPendencia } from "@/modules/uploads/ciclo/pendencias";
import type { PendenciaDoCiclo, PendenciasDoCiclo } from "@/modules/uploads/ciclo/pendencias-queries";

const TODOS = "todos";
const TOM: Record<PendenciaDoCiclo["tipo"], "danger" | "warning" | "success"> = {
  publicada_com_lixeira: "danger",
  analise_parada: "warning",
  duas_publicadas: "danger",
  corrigida: "success",
};
const CHIPS: { id: string; rotulo: string }[] = [
  { id: "todas", rotulo: "Abertas" },
  { id: "publicada_com_lixeira", rotulo: ROTULO_PENDENCIA.publicada_com_lixeira },
  { id: "analise_parada", rotulo: ROTULO_PENDENCIA.analise_parada },
  { id: "duas_publicadas", rotulo: ROTULO_PENDENCIA.duas_publicadas },
  { id: "corrigida", rotulo: ROTULO_PENDENCIA.corrigida },
];

const selecionavel = (l: PendenciaDoCiclo) => l.tipo !== "corrigida" && !l.dispensa;

/**
 * Pendências do ciclo documental (administradores). Uma lista, filtros na URL, "o que fazer" por linha e
 * dispensa com motivo — uma ou em lote. O mesmo `itensDePendenciaCiclo` alimenta o menu de contexto e o
 * `...` (ADR-0002); o lote repete a ação de UMA pendência (`useLote`, teto de 100).
 */
export function PendenciasView({ abertas, dispensadas, corrigidas }: PendenciasDoCiclo) {
  const router = useRouter();
  const sp = useSearchParams();
  const setParams = useSetParams();
  const selecao = useSelecao();
  const lote = useLote();
  const [pending, start] = useTransition();
  const [guias, setGuias] = useState<ReadonlySet<string>>(() => new Set());
  const [dispensando, setDispensando] = useState<string[] | null>(null);
  const [q, setQ] = useState(sp.get("q") ?? "");

  const todas = useMemo(() => [...abertas, ...dispensadas, ...corrigidas], [abertas, dispensadas, corrigidas]);
  const porId = useMemo(() => new Map(todas.map((l) => [l.id, l])), [todas]);
  const projetos = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of todas) m.set(l.projetoId, `${l.projetoCodigo} · ${l.projetoNome}`);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todas]);

  const tipo = sp.get("tipo") ?? "todas";
  const projetoId = sp.get("projeto") ?? "";
  const mostrarDispensadas = sp.get("dispensadas") === "1";
  const visiveis = filtrarPendencias(todas, { tipo, projetoId, q, mostrarDispensadas });
  const contagem = contarPendencias(todas);
  const idsSelecionaveis = visiveis.filter(selecionavel).map((l) => l.id);
  // Sem filtro e sem nada aberto: é "tudo em dia", não "nada neste filtro" (as corrigidas são só histórico).
  const semAbertas = contagem.todas === 0 && tipo === "todas" && !projetoId && !q.trim();

  function aoSelecionar(l: PendenciaDoCiclo, item: AcaoItemAcao) {
    if (item.id === "dispensar") setDispensando(selecao.marcado(l.id) ? selecao.lista : [l.id]);
    else if (item.id === "desfazer-dispensa") {
      start(async () => {
        const r = await desfazerDispensaPendencia({ alvoId: l.alvoId, tipo: l.tipo as TipoPendencia });
        if (r.ok) {
          toast.success("Dispensa desfeita.");
          router.refresh();
        } else toast.error(r.error);
      });
    }
  }

  function alternarGuia(id: string) {
    setGuias((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Pendências documentais"
        descricao="Revisões que fogem da regra do ciclo e esperam uma decisão."
        acoes={
          <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={pending}>
            Atualizar
          </Button>
        }
      />

      <details className="rounded-sm border bg-card px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Como resolver cada tipo de pendência</summary>
        <dl className="mt-3 grid gap-x-4 gap-y-2 md:grid-cols-[max-content_minmax(0,1fr)]">
          {GUIA_DOS_TIPOS.map((g) => (
            <Fragment key={g.tipo}>
              <dt>
                <StatusBadge tone={TOM[g.tipo]}>{g.rotulo}</StatusBadge>
              </dt>
              <dd className="mb-2 text-muted-foreground md:mb-0">{g.texto}</dd>
            </Fragment>
          ))}
        </dl>
      </details>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de pendência">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={tipo === c.id}
            onClick={() => setParams({ tipo: c.id === "todas" ? null : c.id })}
            className="flex items-baseline gap-2 rounded-sm border bg-card px-3 py-1.5 text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
          >
            {c.rotulo}
            <b className="font-mono text-base font-medium tabular-nums">{contagem[c.id as keyof typeof contagem]}</b>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={projetoId || TODOS} onValueChange={(v) => setParams({ projeto: !v || v === TODOS ? null : v })}>
          <SelectTrigger className="h-9 w-[16rem] max-w-full" aria-label="Filtrar por projeto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os projetos</SelectItem>
            {projetos.map(([id, nome]) => (
              <SelectItem key={id} value={id}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParams({ q: e.target.value.trim() || null }, { replace: true });
          }}
          placeholder="Buscar documento"
          aria-label="Buscar documento"
          className="h-9 w-56 max-w-full"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={mostrarDispensadas} onCheckedChange={(v) => setParams({ dispensadas: v ? "1" : null })} />
          Mostrar dispensadas
        </label>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title={semAbertas ? "Nenhuma pendência aberta" : "Nada neste filtro"}
          description={semAbertas ? "Tudo em dia com o ciclo dos documentos." : "Mude o tipo, o projeto ou a busca."}
        />
      ) : (
        // A lista rola por dentro e o cabeçalho da tabela fica fixo (spec §8); no celular a página rola inteira.
        // O contêiner interno do `Table` vira `overflow-visible` para o `sticky` grudar NESTA caixa, não nele.
        <div className="overflow-auto rounded-sm border md:max-h-[max(20rem,calc(100svh-16rem))] [&_[data-slot=table-container]]:overflow-visible">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={idsSelecionaveis.length > 0 && selecao.estadoDaPagina(idsSelecionaveis) === "todos"}
                    onCheckedChange={() => selecao.alternarPagina(idsSelecionaveis)}
                    disabled={idsSelecionaveis.length === 0}
                    aria-label="Marcar todas as pendências abertas desta lista"
                  />
                </TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="hidden md:table-cell">Rev.</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden lg:table-cell">Projeto</TableHead>
                <TableHead className="hidden sm:table-cell">Detalhe</TableHead>
                <TableHead className="w-8 px-1 text-right" aria-label="Ações" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l) => (
                <LinhaPendencia
                  key={l.id}
                  l={l}
                  marcada={selecao.marcado(l.id)}
                  guiaAberto={guias.has(l.id)}
                  onAlternarMarca={() => selecao.alternar(l.id)}
                  onAlternarGuia={() => alternarGuia(l.id)}
                  onAbrirMenu={() => {
                    if (selecionavel(l)) selecao.aoAbrirMenu(l.id);
                  }}
                  onSelect={(item) => aoSelecionar(l, item)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BarraSelecao
        total={selecao.total}
        itens={itensDaSelecaoDePendencias()}
        onSelect={() => setDispensando(selecao.lista)}
        onLimpar={selecao.limpar}
        substantivo={["pendência", "pendências"]}
        genero="f"
        progresso={lote.progresso}
        pendente={lote.pendente}
      />
      {lote.portal}

      {dispensando && (
        <MotivoDialog
          titulo={dispensando.length > 1 ? `Dispensar ${dispensando.length} pendências` : "Dispensar pendência"}
          descricao={
            "A pendência volta a aparecer se algo mudar nela (outro arquivo na lixeira, mudança de estado). " +
            (dispensando.length > 1 ? "O mesmo motivo vale para todas as selecionadas." : "Dá para desfazer depois.")
          }
          rotuloConfirmar="Dispensar"
          onOpenChange={(aberto) => !aberto && setDispensando(null)}
          onConfirmar={async (motivo) => {
            await lote.executar({
              ids: dispensando,
              acao: (id) => {
                const l = porId.get(id)!;
                return dispensarPendencia({ alvoId: l.alvoId, tipo: l.tipo as TipoPendencia, chave: l.chave, motivo });
              },
              substantivo: ["pendência", "pendências"],
              verbo: ["dispensada", "dispensadas"],
              rotulo: (id) => porId.get(id)?.documentoNome ?? id,
              aoConcluir: () => selecao.limpar(),
            });
            return { ok: true };
          }}
        />
      )}
    </div>
  );
}

/** Componente de topo (não definido dentro do pai): senão remonta a cada render e fecha o menu aberto. */
function LinhaPendencia({
  l,
  marcada,
  guiaAberto,
  onAlternarMarca,
  onAlternarGuia,
  onAbrirMenu,
  onSelect,
}: {
  l: PendenciaDoCiclo;
  marcada: boolean;
  guiaAberto: boolean;
  onAlternarMarca: () => void;
  onAlternarGuia: () => void;
  onAbrirMenu: () => void;
  onSelect: (item: AcaoItemAcao) => void;
}) {
  const itens = itensDePendenciaCiclo({ tipo: l.tipo, dispensada: l.dispensa !== null, ...linksDaPendencia(l) });
  const guia = guiaDaPendencia({ tipo: l.tipo, estado: l.estado });
  return (
    <>
      <LinhaComMenu
        itens={itens}
        onSelect={onSelect}
        aoAbrir={(aberto) => {
          if (aberto) onAbrirMenu();
        }}
        render={<TableRow data-state={marcada ? "selected" : undefined} className="data-[popup-open]:bg-muted/50" />}
      >
        <TableCell className="align-top">
          {selecionavel(l) && <Checkbox checked={marcada} onCheckedChange={onAlternarMarca} aria-label={`Marcar ${l.documentoNome}`} />}
        </TableCell>
        <TableCell className={`min-w-0 align-top whitespace-normal ${l.dispensa ? "opacity-70" : ""}`}>
          <p className="break-words font-medium">{l.documentoNome}</p>
          <p className="text-xs text-muted-foreground lg:hidden">{l.projetoNome}</p>
          <div className="mt-1 sm:hidden">
            <p className="text-sm">{l.detalhe}</p>
            {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
          </div>
          <button type="button" onClick={onAlternarGuia} aria-expanded={guiaAberto} className="mt-1 text-xs text-primary underline">
            {guiaAberto ? "Ocultar" : "O que fazer"}
          </button>
        </TableCell>
        <TableCell className="hidden align-top font-mono text-xs md:table-cell">{l.revisao ?? "—"}</TableCell>
        <TableCell className="align-top">
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge tone={TOM[l.tipo]}>{ROTULO_PENDENCIA[l.tipo]}</StatusBadge>
            {l.dispensa && <StatusBadge tone="neutral">Dispensada</StatusBadge>}
          </div>
        </TableCell>
        <TableCell className="hidden align-top whitespace-normal text-muted-foreground lg:table-cell">
          {l.projetoCodigo} · {l.projetoNome}
        </TableCell>
        <TableCell className={`hidden min-w-0 align-top whitespace-normal sm:table-cell ${l.dispensa ? "opacity-70" : ""}`}>
          <p className="text-sm">{l.detalhe}</p>
          {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
          {l.dispensa && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dispensada por {l.dispensa.por} em {formatarDataHora(new Date(l.dispensa.em))}: “{l.dispensa.motivo}”
            </p>
          )}
        </TableCell>
        <TableCell className="px-1 text-right align-top">
          <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={`Ações de ${l.documentoNome}`} />
        </TableCell>
      </LinhaComMenu>
      {guiaAberto && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/50 whitespace-normal">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que fazer</p>
            <p className="mt-1 text-sm">{guia.resumo}</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
              {guia.passos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
            {l.dispensa && (
              <p className="mt-2 text-xs text-muted-foreground sm:hidden">
                Dispensada por {l.dispensa.por} em {formatarDataHora(new Date(l.dispensa.em))}: “{l.dispensa.motivo}”
              </p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
