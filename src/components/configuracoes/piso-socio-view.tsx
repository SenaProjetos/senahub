"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, TriangleAlert, Users } from "lucide-react";
import type { ParDoPiso, SocioDoPiso } from "@/modules/permissoes/queries";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { generoDa, GENERO_META, normalizarBusca } from "@/lib/permissao-genero";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BuscaPermissao, SeloGenero } from "@/components/configuracoes/permissao-genero-ui";

/**
 * Tela do **piso de sócio** — o único eixo de acesso que não aparece em nenhum outro lugar.
 *
 * Era a matriz de 9 colunas de `/configuracoes/permissoes`, que editava a tabela legada
 * `Permissao`. Essa tabela deixou de autorizar na Onda D (`can()` resolve por `PermissaoPerfil`)
 * e a tela virou somente-leitura em 2026-09-02. O que sobrou de verdade foi UMA coluna: a linha
 * do papel `supervisor` na tabela legada é o que `requirePermission` concede a um sócio ativo
 * além do perfil dele (`canRole("supervisor", …)`).
 *
 * As outras 8 colunas eram inércia: só alimentam a matriz dos perfis semente num banco NOVO, e
 * perfil criado pela tela nasce vazio — não copia nada daqui. Mostrá-las sugeria uma referência
 * que não existe.
 */
export function PisoSocioView({
  pares,
  socios,
}: {
  pares: ParDoPiso[];
  socios: SocioDoPiso[];
}) {
  const [busca, setBusca] = useState("");

  const grupos = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    const porRecurso = new Map<string, ParDoPiso[]>();
    for (const p of pares) {
      const lista = porRecurso.get(p.recurso) ?? [];
      lista.push(p);
      porRecurso.set(p.recurso, lista);
    }
    // A ordem do catálogo é a mesma das outras telas de permissão — não reordenar por conta.
    return PERMISSOES_CATALOGO.flatMap((rec) => {
      const doRecurso = porRecurso.get(rec.recurso);
      if (!doRecurso) return [];
      const recursoBate = termo.length > 0 && normalizarBusca(rec.label).includes(termo);
      const linhas = rec.acoes
        .filter((a) => doRecurso.some((p) => p.acao === a.acao))
        .map((a) => ({ acao: a, escrita: !a.leitura }))
        .filter(({ acao }) => {
          if (!termo) return true;
          if (recursoBate) return true;
          const alvo = `${acao.label} ${acao.abre ?? ""} ${rec.recurso}:${acao.acao}`;
          return normalizarBusca(alvo).includes(termo);
        });
      return linhas.length ? [{ recurso: rec, linhas }] : [];
    });
  }, [pares, busca]);

  const escritas = pares.filter((p) => p.escrita).length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Piso de sócio</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            O que um <span className="font-medium">sócio ativo</span> alcança além do que o Perfil
            de acesso dele concede. É o único eixo de acesso que não aparece em nenhuma outra tela.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Cartao rotulo="Permissões no piso" valor={pares.length} />
          <CartaoSocios socios={socios} />
          <Cartao rotulo="De escrita (fora da regra)" valor={escritas} alerta={escritas > 0} />
        </div>

        <p className="flex items-start gap-1.5 rounded-md border bg-muted/50 px-3 py-2 text-xs">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-medium">Somente leitura, e não é a matriz de permissões.</span>{" "}
            Quem concede e revoga acesso é o{" "}
            <Link href="/configuracoes/perfis" className="font-medium underline underline-offset-2">
              Perfil de acesso
            </Link>{" "}
            da pessoa. Esta lista sai da matriz semente no código e só muda por deploy. Perfil novo
            criado pela tela nasce <span className="font-medium">vazio</span> — não herda nada daqui.
          </span>
        </p>

        {escritas > 0 && (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">
                {escritas} {escritas === 1 ? "permissão do piso altera dados" : "permissões do piso alteram dados"}.
              </span>{" "}
              A decisão de 2026-08-08 é que o piso de sócio seja só de leitura, mas nada no código
              filtra por isso — par de escrita na semente do Coordenador vira piso de escrita. Na
              prática o efeito é parcial: o piso só vale em gates de <em>página</em>
              (`requirePermission`); a ação dentro da tela continua exigindo a permissão de
              verdade. Ou seja, o sócio abre a tela de gestão e é negado ao agir.
            </span>
          </p>
        )}

        <BuscaPermissao valor={busca} onChange={setBusca} />

        {grupos.length === 0 ? (
          <div className="rounded-sm border p-10 text-center text-sm text-muted-foreground">
            Nenhuma permissão do piso corresponde à busca.
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map(({ recurso, linhas }) => (
              <section key={recurso.recurso} className="overflow-hidden rounded-sm border">
                <header className="flex items-center gap-2 border-b bg-muted px-3 py-2">
                  <h3 className="text-sm font-semibold">{recurso.label}</h3>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {linhas.length}
                  </span>
                </header>
                <ul>
                  {linhas.map(({ acao, escrita }) => {
                    const genero = generoDa(acao);
                    return (
                      <li
                        key={acao.acao}
                        className={cn(
                          "flex items-start gap-2 border-b border-l-2 px-3 py-2 last:border-b-0",
                          GENERO_META[genero].borda,
                        )}
                      >
                        <SeloGenero genero={genero} className="mt-px" descritivo />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                            {acao.label}
                            {escrita && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="cursor-help rounded-sm border border-warning/40 bg-warning/10 px-1 text-[10px] font-medium text-warning">
                                      altera dados
                                    </span>
                                  }
                                />
                                <TooltipContent>
                                  O piso de sócio deveria conceder só leitura (decisão de
                                  2026-08-08). Este par escreve.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            {acao.abre && <span>Abre: {acao.abre}</span>}
                            <code className="font-mono opacity-60">
                              {recurso.recurso}:{acao.acao}
                            </code>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/**
 * Quem o piso realmente alcança. Nomear em vez de contar é o ponto: "3 sócios ativos" não diz
 * se o piso importa, e para sócio superusuário ele é inerte — o `can()` já resolve antes.
 */
function CartaoSocios({ socios }: { socios: SocioDoPiso[] }) {
  const efetivos = socios.filter((s) => !s.bypass).length;
  return (
    <div className="rounded-sm border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        <Users className="size-3.5" />
        Sócios ativos
      </div>
      {socios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum — o piso não alcança ninguém hoje.
        </p>
      ) : (
        <>
          <div className="text-lg font-semibold tabular-nums">
            {socios.length}
            {efetivos !== socios.length && (
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                · {efetivos} {efetivos === 1 ? "alcançado" : "alcançados"}
              </span>
            )}
          </div>
          <ul className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {socios.map((s) => (
              <li key={s.id} className="flex items-center gap-1">
                <span className={cn(s.bypass && "line-through decoration-dotted")}>{s.nome}</span>
                {s.bypass && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="cursor-help rounded-sm border px-1 text-[10px]">
                          bypass
                        </span>
                      }
                    />
                    <TooltipContent>
                      Superusuário: o `can()` já concede tudo antes de o piso ser consultado, então
                      o piso não muda nada para esta pessoa.
                    </TooltipContent>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  icone,
  alerta,
}: {
  rotulo: string;
  valor: number;
  icone?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className={cn("rounded-sm border bg-card px-3 py-2", alerta && "border-warning/40")}>
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        {icone}
        {rotulo}
      </div>
      <div className={cn("text-lg font-semibold tabular-nums", alerta && "text-warning")}>{valor}</div>
    </div>
  );
}
