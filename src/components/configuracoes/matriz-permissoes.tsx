"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { type AcaoCatalogo, type RecursoCatalogo } from "@/lib/permissions-catalog";
import {
  chaveDe,
  filtrarCatalogo,
  generoDa,
  GENERO_META,
  GRUPOS_CATALOGO,
  resumoDoRecurso,
  semTelaConcedida,
  TOTAL_PARES,
  type FiltroGenero,
} from "@/lib/permissao-genero";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BuscaPermissao,
  FiltroGeneros,
  LegendaGeneros,
  SeloAlteraDados,
  SeloGenero,
} from "@/components/configuracoes/permissao-genero-ui";

type Matriz = Record<string, Record<string, boolean>>;

// admin tem bypass total — não aparece como coluna.
const EDITAVEIS = ROLES.filter((r) => r !== "admin");

/**
 * Matriz SEMENTE, somente-leitura (decisão do dono, 2026-09-02 — §5-A de
 * docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md).
 *
 * Esta tela editava a tabela `Permissao`, que **não autoriza mais nada** desde a Onda D:
 * `can()` resolve por `PermissaoPerfil` (Perfil de acesso) + `PermissaoUsuario` (override).
 * Editar aqui não tinha efeito para quem estivesse em perfil customizado, e para os perfis
 * semente só chegava no `db:seed` seguinte — por um caminho que apagava junto o que o dono
 * tivesse configurado. Prometia "vale imediatamente" e entregava o oposto.
 *
 * O que a tabela ainda faz, e por isso ela continua sendo semeada: (1) é o ponto de partida
 * de um banco novo, via `PERMISSOES_BASE`; (2) o **piso de sócio** de `requirePermission`
 * consulta `canRole("supervisor", …)` direto nela (`lib/session.ts`). Aposentar a TELA não é
 * aposentar a TABELA.
 */
export function MatrizPermissoes({ matriz }: { matriz: Matriz }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroGenero>("tudo");
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());

  const visiveis = useMemo(() => filtrarCatalogo(busca, filtro), [busca, filtro]);
  const totalVisivel = visiveis.reduce((n, g) => n + g.acoes.length, 0);
  // Durante uma busca, recolher esconderia justamente o que a pessoa procurou.
  const buscando = busca.trim().length > 0;

  function alternarGrupo(recurso: string) {
    setRecolhidos((s) => {
      const prox = new Set(s);
      if (prox.has(recurso)) prox.delete(recurso);
      else prox.add(recurso);
      return prox;
    });
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Permissões (matriz semente)</h2>
          <p className="text-sm text-muted-foreground">
            Referência do que cada papel recebe num banco novo. O perfil{" "}
            <span className="font-medium">Administrador</span> tem acesso total e não aparece aqui.
          </p>
          <p className="mt-2 flex items-start gap-1.5 rounded-md border bg-muted/50 px-3 py-2 text-xs">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">Somente leitura.</span> Quem autoriza de verdade é o{" "}
              <Link href="/configuracoes/perfis" className="font-medium underline underline-offset-2">
                Perfil de acesso
              </Link>{" "}
              da pessoa — é lá que se concede e se revoga, e vale na hora. Esta tela mostra só o
              ponto de partida usado quando um perfil é criado pela primeira vez; mudá-la exige
              alterar a semente no código.
            </span>
          </p>
        </div>

        <LegendaGeneros />

        <div className="flex flex-wrap items-center gap-2">
          <BuscaPermissao valor={busca} onChange={setBusca} />
          <FiltroGeneros valor={filtro} onChange={setFiltro} />
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRecolhidos((s) =>
                s.size > 0 ? new Set() : new Set(GRUPOS_CATALOGO.map((g) => g.recurso.recurso)),
              )
            }
          >
            {recolhidos.size > 0 ? "Expandir tudo" : "Recolher tudo"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {totalVisivel} de {TOTAL_PARES} permissões
          </span>
        </div>

        {visiveis.length === 0 ? (
          <div className="rounded-sm border p-10 text-center text-sm text-muted-foreground">
            Nenhuma permissão corresponde à busca.
          </div>
        ) : (
          <div className="max-h-[calc(100vh-22rem)] overflow-auto rounded-sm border">
            {/* Tabela crua, não o primitivo `Table`: o `overflow-x-auto` interno dele criaria um
                segundo contexto de rolagem e mataria o `sticky top-0` do cabeçalho. */}
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 w-full min-w-80 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Recurso / permissão
                  </th>
                  {EDITAVEIS.map((r) => (
                    <th
                      key={r}
                      className="sticky top-0 z-20 min-w-24 border-b border-l bg-card px-2 py-2 text-center text-xs font-medium whitespace-nowrap"
                    >
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map(({ recurso, acoes }) => (
                  <GrupoRecurso
                    key={recurso.recurso}
                    recurso={recurso}
                    acoes={acoes}
                    recolhido={!buscando && recolhidos.has(recurso.recurso)}
                    podeRecolher={!buscando}
                    matriz={matriz}
                    onAlternarGrupo={() => alternarGrupo(recurso.recurso)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function GrupoRecurso({
  recurso,
  acoes,
  recolhido,
  podeRecolher,
  matriz,
  onAlternarGrupo,
}: {
  recurso: RecursoCatalogo;
  /** Já filtrado — desenha as linhas. Contagens saem sempre de `recurso.acoes`. */
  acoes: AcaoCatalogo[];
  recolhido: boolean;
  podeRecolher: boolean;
  matriz: Matriz;
  onAlternarGrupo: () => void;
}) {
  return (
    <>
      <tr>
        <th scope="rowgroup" className="sticky left-0 z-10 border-y bg-muted px-2 py-1.5 text-left">
          <button
            type="button"
            onClick={onAlternarGrupo}
            disabled={!podeRecolher}
            aria-expanded={!recolhido}
            className="flex w-full items-center gap-1.5 text-left disabled:cursor-default"
          >
            {podeRecolher &&
              (recolhido ? (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ))}
            <span className="text-sm font-semibold">{recurso.label}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {resumoDoRecurso(recurso)}
            </span>
          </button>
        </th>
        {EDITAVEIS.map((r) => (
          <ResumoDoGrupo key={r} role={r} recurso={recurso} matriz={matriz} />
        ))}
      </tr>

      {!recolhido &&
        acoes.map((a) => {
          const key = chaveDe(recurso, a);
          const genero = generoDa(a);
          return (
            <tr key={key} className="group transition-colors hover:bg-muted/40">
              <td
                className={cn(
                  "sticky left-0 z-10 border-b border-l-2 bg-card px-3 py-1.5 group-hover:bg-muted/40",
                  GENERO_META[genero].borda,
                )}
              >
                <div className="flex items-start gap-2">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="mt-px">
                          <SeloGenero genero={genero} />
                        </span>
                      }
                    />
                    <TooltipContent>{GENERO_META[genero].descricao}</TooltipContent>
                  </Tooltip>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{a.label}</span>
                      {genero === "tela" && !a.leitura && <SeloAlteraDados />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      {a.abre && <span>Abre: {a.abre}</span>}
                      <code className="font-mono opacity-60">{key}</code>
                    </div>
                  </div>
                </div>
              </td>
              {EDITAVEIS.map((r) => {
                const marcado = matriz[r]?.[key] ?? false;
                return (
                  <td
                    key={r}
                    className={cn(
                      "border-b border-l px-2 py-1.5 text-center",
                      marcado && "bg-primary/5",
                    )}
                  >
                    <Checkbox
                      checked={marcado}
                      disabled
                      aria-label={`${ROLE_LABELS[r]}: ${a.label}`}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}

/**
 * Contagem do recurso por papel — sempre sobre o recurso inteiro, independente do filtro em uso.
 * Fica em âmbar quando o papel tem alguma permissão do recurso mas nenhuma das telas DESTE
 * recurso; ver `semTelaConcedida` para por que o texto é fato, não veredito.
 */
function ResumoDoGrupo({
  role,
  recurso,
  matriz,
}: {
  role: Role;
  recurso: RecursoCatalogo;
  matriz: Matriz;
}) {
  const concedida = (chave: string) => matriz[role]?.[chave] === true;
  const marcadas = recurso.acoes.filter((a) => concedida(chaveDe(recurso, a))).length;
  const alerta = semTelaConcedida(recurso, concedida);

  return (
    <td className="border-y border-l bg-muted px-2 py-1.5 text-center">
      {marcadas === 0 ? (
        <span className="text-[11px] text-muted-foreground/50">—</span>
      ) : alerta ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="cursor-help text-[11px] font-medium text-amber-600 underline decoration-dotted dark:text-amber-500">
                {marcadas}/{recurso.acoes.length}
              </span>
            }
          />
          <TooltipContent>
            Nenhuma tela de “{recurso.label}” está na semente de {ROLE_LABELS[role]}. Confira se o
            acesso vem de outro recurso.
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-[11px] font-medium text-muted-foreground">
          {marcadas}/{recurso.acoes.length}
        </span>
      )}
    </td>
  );
}
