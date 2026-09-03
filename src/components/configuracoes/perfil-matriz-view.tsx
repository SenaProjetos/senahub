"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Info, TriangleAlert } from "lucide-react";
import { setPermissaoPerfil } from "@/modules/perfis/actions";
import type { RecursoCatalogo } from "@/lib/permissions-catalog";
import {
  chaveDe,
  contarGeneros,
  filtrarCatalogo,
  generoDa,
  GENERO_META,
  GENEROS,
  GRUPOS_CATALOGO,
  resumoDoRecurso,
  semTelaConcedida,
  TOTAL_PARES,
  type FiltroGenero,
} from "@/lib/permissao-genero";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BuscaPermissao,
  FiltroGeneros,
  LegendaGeneros,
  SeloAlteraDados,
  SeloGenero,
} from "@/components/configuracoes/permissao-genero-ui";

type Matriz = Record<string, boolean>;

export function PerfilMatrizView({
  perfilId,
  nome,
  chave,
  sistema,
  matriz: inicial,
}: {
  perfilId: string;
  nome: string;
  chave: string;
  sistema: boolean;
  matriz: Matriz;
}) {
  const [matriz, setMatriz] = useState<Matriz>(inicial);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroGenero>("tudo");
  const [soConcedidas, setSoConcedidas] = useState(false);
  const [, start] = useTransition();

  function toggle(recurso: string, acao: string, permitido: boolean) {
    const key = `${recurso}:${acao}`;
    setMatriz((m) => ({ ...m, [key]: permitido }));
    setPendentes((p) => new Set(p).add(key));
    start(async () => {
      const r = await setPermissaoPerfil({ perfilId, recurso, acao, permitido });
      if (!r.ok) {
        toast.error(r.error);
        setMatriz((m) => ({ ...m, [key]: !permitido }));
      }
      setPendentes((p) => {
        const prox = new Set(p);
        prox.delete(key);
        return prox;
      });
    });
  }

  const concedida = useCallback((k: string) => matriz[k] === true, [matriz]);

  /** Concedidas por gênero, sobre o catálogo inteiro — é o retrato do perfil, não da busca. */
  const placar = useMemo(() => {
    const p = {
      tela: { sim: 0, total: 0 },
      acao: { sim: 0, total: 0 },
      dados: { sim: 0, total: 0 },
    };
    for (const { recurso, acoes } of GRUPOS_CATALOGO) {
      for (const a of acoes) {
        const g = generoDa(a);
        p[g].total += 1;
        if (concedida(chaveDe(recurso, a))) p[g].sim += 1;
      }
    }
    return p;
  }, [concedida]);

  const totalConcedidas = placar.tela.sim + placar.acao.sim + placar.dados.sim;

  const visiveis = useMemo(() => {
    const base = filtrarCatalogo(busca, filtro);
    if (!soConcedidas) return base;
    return base
      .map(({ recurso, acoes }) => ({
        recurso,
        acoes: acoes.filter((a) => concedida(chaveDe(recurso, a))),
      }))
      .filter((g) => g.acoes.length > 0);
  }, [busca, filtro, soConcedidas, concedida]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <Link
            href="/configuracoes/perfis"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ChevronLeft className="size-4" /> Perfis de acesso
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">{nome}</h2>
            <span className="font-mono text-xs text-muted-foreground">{chave}</span>
            {sistema && <Badge variant="outline">sistema</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Alterações <span className="font-medium">valem imediatamente</span> para quem tem este
            perfil — inclusive para revogar. Não cobre a fila de Aprovações nem a jornada, que ainda
            dependem do Papel do usuário.
          </p>
          {sistema && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md border bg-muted/50 px-3 py-2 text-xs">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span>
                Perfil de sistema: nasce com a matriz semente e não pode ser excluído. O que você
                editar aqui <span className="font-medium">sobrevive ao deploy</span> — desde
                2026-09-02 o <span className="font-medium">db:seed</span> só escreve a matriz de
                perfil que ainda não existe. Para uma exceção de uma pessoa só, prefira um override
                na ficha dela.
              </span>
            </p>
          )}
        </div>

        <LegendaGeneros />

        {/* Retrato do perfil: quantas telas ele abre, quanto pode fazer e quanto enxerga. */}
        <div className="grid gap-2 sm:grid-cols-4">
          <Placar rotulo="Concedidas" sim={totalConcedidas} total={TOTAL_PARES} destaque />
          {GENEROS.map((g) => (
            <Placar
              key={g}
              rotulo={GENERO_META[g].titulo}
              sim={placar[g].sim}
              total={placar[g].total}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BuscaPermissao valor={busca} onChange={setBusca} />
          <FiltroGeneros valor={filtro} onChange={setFiltro} />
          <Button
            size="sm"
            variant={soConcedidas ? "secondary" : "outline"}
            aria-pressed={soConcedidas}
            onClick={() => setSoConcedidas((v) => !v)}
          >
            Só concedidas
          </Button>
        </div>

        {visiveis.length === 0 ? (
          <div className="rounded-sm border p-10 text-center text-sm text-muted-foreground">
            {soConcedidas
              ? "Nenhuma permissão concedida corresponde ao filtro."
              : "Nenhuma permissão corresponde à busca."}
          </div>
        ) : (
          <div className="space-y-3">
            {visiveis.map(({ recurso, acoes }) => (
              <CartaoRecurso
                key={recurso.recurso}
                recurso={recurso}
                acoes={acoes}
                concedida={concedida}
                pendentes={pendentes}
                onToggle={toggle}
              />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function Placar({
  rotulo,
  sim,
  total,
  destaque,
}: {
  rotulo: string;
  sim: number;
  total: number;
  destaque?: boolean;
}) {
  return (
    <div className={cn("rounded-sm border bg-card px-3 py-2", destaque && "border-primary/40")}>
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{rotulo}</div>
      <div className="text-lg font-semibold tabular-nums">
        {sim}
        <span className="text-sm font-normal text-muted-foreground"> / {total}</span>
      </div>
    </div>
  );
}

function CartaoRecurso({
  recurso,
  acoes,
  concedida,
  pendentes,
  onToggle,
}: {
  recurso: RecursoCatalogo;
  /** Já filtrado — desenha as linhas. Contagens saem sempre de `recurso.acoes`. */
  acoes: RecursoCatalogo["acoes"];
  concedida: (chave: string) => boolean;
  pendentes: Set<string>;
  onToggle: (recurso: string, acao: string, permitido: boolean) => void;
}) {
  const marcadas = recurso.acoes.filter((a) => concedida(chaveDe(recurso, a))).length;
  const alerta = semTelaConcedida(recurso, concedida);
  const { tela: nTelas } = contarGeneros(recurso);

  return (
    <section className="overflow-hidden rounded-sm border">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted px-3 py-2">
        <h3 className="text-sm font-semibold">{recurso.label}</h3>
        <span className="text-[11px] text-muted-foreground">{resumoDoRecurso(recurso)}</span>
        <span className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
          {marcadas}/{recurso.acoes.length}
        </span>
        {alerta && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex cursor-help items-center gap-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="size-3" aria-hidden />
                  sem tela
                </span>
              }
            />
            <TooltipContent>
              Este perfil tem {marcadas} permissão(ões) em “{recurso.label}” mas nenhuma das{" "}
              {nTelas === 1 ? "telas" : `${nTelas} telas`} do recurso. Confira se o acesso vem de
              outro recurso ou de override individual.
            </TooltipContent>
          </Tooltip>
        )}
      </header>

      <ul>
        {acoes.map((a) => {
          const key = chaveDe(recurso, a);
          const genero = generoDa(a);
          const marcado = concedida(key);
          const pendente = pendentes.has(key);
          return (
            <li key={key} className="border-b last:border-b-0">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 border-l-2 px-3 py-2 transition-colors hover:bg-muted/40",
                  GENERO_META[genero].borda,
                  marcado && "bg-primary/5",
                  pendente && "opacity-50",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={marcado}
                  onCheckedChange={(c) => onToggle(recurso.recurso, a.acao, c === true)}
                />
                <SeloGenero genero={genero} className="mt-px" descritivo />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    {a.label}
                    {genero === "tela" && !a.leitura && <SeloAlteraDados />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    {a.abre && <span>Abre: {a.abre}</span>}
                    <code className="font-mono opacity-60">{key}</code>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
