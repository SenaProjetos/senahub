"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Files, Search } from "lucide-react";
import { BotaoFerramenta } from "@/components/pdf/botao-ferramenta";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, rotuloRevisao } from "@/lib/utils";
import {
  agruparPorDisciplina,
  ancoraNaLista,
  escopoEtapaDisponivel,
  filtrarPranchas,
  pranchasDoEscopo,
  rotuloPrancha,
  vizinhas,
  type EscopoPranchas,
  type PranchaNavegavel,
} from "@/modules/uploads/pranchas-navegacao";

/** Onde o navegador lembra o recorte escolhido (etapa × projeto) — conveniência de quem navega. */
const CHAVE_ESCOPO = "senahub:pranchas-escopo";

/**
 * "1/N pranchas" do visualizador: as setas andam pela lista, e o meio abre a lista inteira — os
 * PDFs do projeto que a pessoa pode abrir, por disciplina, com número e título da prancha. Por
 * padrão a lista (e as setas) ficam na etapa da prancha aberta; "Projeto" mostra todas.
 */
export function SeletorPranchas({
  projetoId,
  uploadId,
  documentoIds,
  pranchas,
}: {
  projetoId: string;
  uploadId: string;
  /** Documento lógico da prancha aberta (e o canônico, após merge) — ver `ancoraNaLista`. */
  documentoIds: string[];
  pranchas: PranchaNavegavel[];
}) {
  const router = useRouter();
  const [escopo, setEscopo] = useState<EscopoPranchas>("etapa");
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_ESCOPO);
      if (salvo === "projeto" || salvo === "etapa") setEscopo(salvo);
    } catch {
      /* sem armazenamento (aba privada): fica a etapa */
    }
  }, []);

  function escolherEscopo(e: EscopoPranchas) {
    setEscopo(e);
    try {
      localStorage.setItem(CHAVE_ESCOPO, e);
    } catch {
      /* idem */
    }
  }

  // Revisão anterior aberta: a lista (só vigentes) se ancora na vigente do mesmo documento.
  const ancora = ancoraNaLista(pranchas, uploadId, documentoIds);
  const revisaoAntiga = ancora !== uploadId;
  const temEtapa = escopoEtapaDisponivel(pranchas, ancora);
  const efetivo: EscopoPranchas = temEtapa ? escopo : "projeto";
  const lista = useMemo(() => pranchasDoEscopo(pranchas, ancora, efetivo), [pranchas, ancora, efetivo]);
  const atual = pranchas.find((p) => p.uploadId === ancora) ?? null;
  const { anterior, proxima, posicao } = vizinhas(lista, ancora);
  const filtradas = useMemo(() => filtrarPranchas(lista, termo), [lista, termo]);
  const grupos = agruparPorDisciplina(filtradas);
  // A sigla da etapa em cada linha só informa quando a lista mistura etapas.
  const variasEtapas = new Set(lista.map((p) => p.faseId)).size > 1;
  const totalEtapa = temEtapa ? pranchasDoEscopo(pranchas, ancora, "etapa").length : 0;
  const href = (p: PranchaNavegavel) => `/projetos/${projetoId}/arquivos/${p.uploadId}/visualizar`;

  if (pranchas.length <= 1) return null;

  return (
    <nav className="flex shrink-0 items-center rounded-sm border" aria-label="Navegação entre pranchas">
      <BotaoFerramenta
        rotulo="Prancha anterior"
        dica={anterior ? rotuloPrancha(anterior) : "Esta é a primeira da lista."}
        disabled={!anterior}
        render={anterior ? <Link href={href(anterior)} /> : undefined}
      >
        <ArrowLeft />
      </BotaoFerramenta>
      <Popover
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) setTermo("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 px-1.5 text-xs tabular-nums text-muted-foreground"
              aria-label={`Lista de pranchas: ${posicao || "–"} de ${lista.length}${atual ? ` — ${rotuloPrancha(atual)}` : ""}`}
              title={atual ? rotuloPrancha(atual) : undefined}
            />
          }
        >
          <Files aria-hidden />
          {posicao || "–"}/{lista.length}
          <ChevronDown aria-hidden className="size-3" />
        </PopoverTrigger>
        <PopoverContent align="center" className="w-[min(26rem,calc(100vw-2rem))] gap-0 p-0">
          <div className="space-y-2 border-b p-2">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => {
                  // Enter abre a primeira que sobrou — buscar "4007" e Enter já leva à prancha.
                  if (e.key === "Enter" && filtradas[0]) {
                    e.preventDefault();
                    setAberto(false);
                    router.push(href(filtradas[0]));
                  }
                }}
                placeholder="Número, título ou arquivo…"
                aria-label="Filtrar pranchas"
                className="h-8 w-full rounded-sm border bg-background pl-7 pr-2 text-sm outline-none focus:border-primary"
              />
            </div>
            {temEtapa && (
              <div className="flex gap-1" role="group" aria-label="Quais pranchas listar">
                <Button
                  size="xs"
                  variant={efetivo === "etapa" ? "default" : "outline"}
                  aria-pressed={efetivo === "etapa"}
                  onClick={() => escolherEscopo("etapa")}
                >
                  {atual?.faseNome ?? "Esta etapa"} ({totalEtapa})
                </Button>
                <Button
                  size="xs"
                  variant={efetivo === "projeto" ? "default" : "outline"}
                  aria-pressed={efetivo === "projeto"}
                  onClick={() => escolherEscopo("projeto")}
                >
                  Projeto inteiro ({pranchas.length})
                </Button>
              </div>
            )}
          </div>
          <div className="max-h-[min(60vh,28rem)] overflow-y-auto py-1">
            {grupos.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma prancha com esse termo.</p>
            ) : (
              grupos.map((g) => (
                <section key={g.disciplinaId} aria-label={g.disciplinaNome}>
                  <h3 className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.disciplinaNome}
                  </h3>
                  <ul>
                    {g.pranchas.map((p) => {
                      const ehAtual = p.uploadId === ancora;
                      return (
                        <li key={p.uploadId}>
                          <Link
                            href={href(p)}
                            onClick={() => setAberto(false)}
                            aria-current={ehAtual && !revisaoAntiga ? "page" : undefined}
                            className={cn(
                              "flex items-start gap-2 px-3 py-1.5 outline-none hover:bg-muted focus-visible:bg-muted",
                              ehAtual && "bg-primary/10",
                            )}
                          >
                            <span className="w-11 shrink-0 pt-px font-mono text-xs tabular-nums text-muted-foreground">
                              {p.numeroPrancha ?? "—"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-sm", ehAtual && "font-semibold")}>
                                {p.titulo?.trim() || p.nomeArquivo}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {p.nomeArquivo} · {rotuloRevisao(p.revisao)}
                                {ehAtual && revisaoAntiga ? " · versão vigente desta prancha" : ""}
                                {variasEtapas && p.faseSigla ? ` · ${p.faseSigla}` : ""}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      <BotaoFerramenta
        rotulo="Próxima prancha"
        dica={proxima ? rotuloPrancha(proxima) : "Esta é a última da lista."}
        disabled={!proxima}
        render={proxima ? <Link href={href(proxima)} /> : undefined}
      >
        <ArrowRight />
      </BotaoFerramenta>
    </nav>
  );
}
