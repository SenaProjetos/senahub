"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Lightbulb, UserRoundCheck, Users } from "lucide-react";
import { sugestoesDaSobrecarga } from "@/modules/planejamento/recursos-actions";
import type { CargaDaEquipe, SobrecargaComSugestao } from "@/modules/planejamento/recursos-queries";
import type { Sugestoes } from "@/modules/planejamento/sugestoes-recursos";
import type { ProjetoRef } from "@/modules/planejamento/recursos-filtros";
import { SinalSemCronograma } from "@/components/recursos/sinal-sem-cronograma";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarData } from "@/lib/utils";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

function wkLabel(wk: string) {
  // "2026-W23" → "Sem 23/26"
  const [y, w] = wk.split("-W");
  return `Sem ${w}/${y.slice(2)}`;
}

function heatCarga(horas: number, capacidade: number) {
  if (horas === 0) return "transparent";
  const proporcao = capacidade > 0 ? horas / capacidade : Infinity;
  if (proporcao < 0.2) return "hsl(210 60% 85%)";
  if (proporcao < 0.5) return "hsl(210 60% 68%)";
  if (proporcao <= 0.9) return "hsl(210 70% 52%)";
  if (proporcao <= 1.1) return "hsl(28 90% 64%)";
  return "hsl(0 75% 60%)";
}

/**
 * Carga PLANEJADA da equipe (F5 — D17, D18, D8): horas das atribuições nas linhas dos
 * projetos com cronograma aprovado, contra a capacidade de cada semana. Diferente da "Carga
 * real", que é o que o ponto registrou.
 *
 * Só lê (Lote 2): as sugestões (D18) dizem o que atrasar ou passar, e o link abre a EAP do projeto,
 * onde a correção se faz. Nada é aplicado daqui.
 */
export function CargaPlanejadaView({
  carga,
  sinaisPorUser,
  pessoasVisiveis,
}: {
  carga: CargaDaEquipe;
  /** Projetos ativos sem cronograma aprovado por pessoa — só um sinal, sem horas. */
  sinaisPorUser: Record<string, ProjetoRef[]>;
  /** Filtros da tela; `null` = todas as pessoas. */
  pessoasVisiveis: ReadonlySet<string> | null;
}) {
  const pessoas = pessoasVisiveis ? carga.pessoas.filter((p) => pessoasVisiveis.has(p.userId)) : carga.pessoas;
  const sobrecargas = pessoasVisiveis ? carga.sobrecargas.filter((s) => pessoasVisiveis.has(s.userId)) : carga.sobrecargas;
  const nomeDe = new Map(carga.pessoas.map((p) => [p.userId, p.nome]));
  const nomeProjeto = (id: string) => {
    const p = carga.rotulos.projetos[id];
    return p ? `${formatarCodigo(p.codigo)} · ${p.nome}` : "projeto";
  };

  const semDados = carga.pessoas.length === 0 && carga.demandaPerfis.length === 0;
  if (semDados) {
    return (
      <div className="rounded-sm border px-3 py-8">
        <EmptyState
          icon={Users}
          title="Nenhum projeto com cronograma aprovado tem gente escalada."
          description="A carga planejada vem das horas das pessoas nas linhas da EAP. Aprove um cronograma e atribua pessoas às atividades."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Horas previstas nas linhas dos projetos com cronograma aprovado ({carga.projetosCalculados.length}).
        {carga.projetosEmRascunho.length > 0 &&
          ` Em cinza, à parte, o que ${carga.projetosEmRascunho.length} cronograma(s) em rascunho já prevê — só soma depois de aprovar.`}
        Projeto sem cronograma aprovado não soma horas: a pessoa recebe o selo “sem cronograma”.
      </p>

      {sobrecargas.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="size-4 text-destructive" />
            {sobrecargas.length} semana(s) acima da capacidade
          </h3>
          <ul className="space-y-2">
            {sobrecargas.map((s) => (
              <SobrecargaItem
                key={`${s.userId}:${s.semana}`}
                s={s}
                nome={nomeDe.get(s.userId) ?? "—"}
                nomeDe={(id) => nomeDe.get(id) ?? "—"}
                nomeProjeto={nomeProjeto}
                linhaNome={(id) => carga.rotulos.linhas[id]?.nome ?? "linha"}
                linhaProjetoId={(id) => carga.rotulos.linhas[id]?.projetoId}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">Pessoa</th>
              {carga.semanas.map((wk) => (
                <th key={wk} className="px-1 py-2 text-center font-normal">
                  {wkLabel(wk)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={carga.semanas.length + 1} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhum resultado para os filtros.
                </td>
              </tr>
            )}
            {pessoas.map((p) => (
              <tr key={p.userId}>
                <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <AvatarUsuario nome={p.nome} image={p.image} size="sm" className="size-6 shrink-0" />
                    {p.nome}
                    <SinalSemCronograma projetos={sinaisPorUser[p.userId] ?? []} />
                  </div>
                </td>
                {carga.semanas.map((wk) => {
                  const h = p.carga[wk] ?? 0;
                  const cap = p.capacidade[wk] ?? 0;
                  const r = p.rascunho[wk] ?? 0;
                  const acima = cap === 0 ? h > 0 : h > cap;
                  return (
                    <td
                      key={wk}
                      className="border-l px-1 py-2 text-center"
                      style={{ background: heatCarga(h, cap) }}
                      title={
                        `${p.nome} · ${wkLabel(wk)} — ${h}h planejadas de ${cap}h disponíveis` +
                        (r > 0 ? ` · mais ${r}h em EAP ainda em rascunho (não somam até aprovar)` : "")
                      }
                    >
                      <span className={`font-mono text-[10px] ${acima ? "font-bold text-white" : "text-foreground/70"}`}>
                        {`${h}/${cap}`}
                      </span>
                      {r > 0 && <span className="block font-mono text-[9px] text-muted-foreground">+{r} rasc.</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {carga.demandaPerfis.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Demanda ainda sem pessoa (perfis)</h3>
          <p className="text-xs text-muted-foreground">
            Horas atribuídas a um perfil — &ldquo;Projetista&rdquo; numa linha da Elétrica, por exemplo. Ninguém
            está escalado ainda, então não entram na carga de ninguém.
          </p>
          <div className="overflow-x-auto rounded-sm border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Perfil</th>
                  {carga.semanas.map((wk) => (
                    <th key={wk} className="px-1 py-2 text-center font-normal">
                      {wkLabel(wk)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {carga.demandaPerfis.map((d) => (
                  <tr key={`${d.papel}:${d.disciplina ?? ""}`}>
                    <td className="px-3 py-2 font-medium">
                      {d.rotuloPapel}
                      {d.disciplina ? <span className="text-muted-foreground"> · {d.disciplina}</span> : null}
                    </td>
                    {carga.semanas.map((wk) => (
                      <td key={wk} className="border-l px-1 py-2 text-center font-mono text-[10px] text-foreground/70">
                        {d.porSemana[wk] ? `${d.porSemana[wk]}h` : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SobrecargaItem({
  s,
  nome,
  nomeDe,
  nomeProjeto,
  linhaNome,
  linhaProjetoId,
}: {
  s: SobrecargaComSugestao;
  nome: string;
  nomeDe: (userId: string) => string;
  nomeProjeto: (projetoId: string) => string;
  linhaNome: (linhaId: string) => string;
  linhaProjetoId: (linhaId: string) => string | undefined;
}) {
  const router = useRouter();
  // Sugestões sob demanda: cada uma roda o motor de novo (ver `SobrecargaComSugestao`). A
  // listagem vem sem elas e só quem clica paga o cálculo.
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null);
  const [buscando, startBusca] = useTransition();

  function buscarSugestoes() {
    startBusca(async () => {
      const r = await sugestoesDaSobrecarga({ userId: s.userId, semana: s.semana });
      if (r.ok) setSugestoes(r.data);
      else {
        toast.error(r.error);
        router.refresh();
      }
    });
  }
  const atrasar = sugestoes?.atrasar ?? null;
  const passar = sugestoes?.passar ?? null;

  const origem = s.parcelas.find((p) => p.linhaId != null) ?? s.parcelas[0];

  return (
    <li className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
      <p>
        <strong>{nome}</strong> · {wkLabel(s.semana)}: <strong>{s.carga}h</strong> planejadas para{" "}
        <strong>{s.capacidade}h</strong> disponíveis —{" "}
        <span className="font-semibold text-destructive">{s.excesso}h acima</span>.
        {s.motivosReducao.length > 0 && (
          <span className="ml-1 text-muted-foreground">Capacidade menor por {s.motivosReducao.join(", ")}.</span>
        )}
      </p>
      {origem && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Maior parcela: {origem.linhaId ? `“${linhaNome(origem.linhaId)}” em ` : "alocação digitada em "}
          {nomeProjeto(origem.projetoId)} ({Math.round(origem.horas * 10) / 10}h).
        </p>
      )}

      {sugestoes == null && (
        <Button size="sm" variant="outline" className="mt-2" disabled={buscando} onClick={buscarSugestoes}>
          <Lightbulb className="size-3.5" /> {buscando ? "Calculando…" : "Ver sugestões"}
        </Button>
      )}
      {(atrasar || passar) && (
        <ul className="mt-2 space-y-1 text-xs">
          {atrasar && (
            <li className="flex flex-wrap items-center gap-1.5">
              <CalendarClock className="size-3.5 shrink-0" />
              Atrasar “{linhaNome(atrasar.linhaId)}” em {atrasar.diasUteis} dia(s) útil(eis), para{" "}
              {formatarData(atrasar.novoInicio)}
              {atrasar.resolve ? " (resolve)" : " (alivia)"}.
              <LinkEap projetoId={linhaProjetoId(atrasar.linhaId)} />
            </li>
          )}
          {passar && (
            <li className="flex flex-wrap items-center gap-1.5">
              <UserRoundCheck className="size-3.5 shrink-0" />
              Passar “{linhaNome(passar.linhaId)}” para {nomeDe(passar.paraUserId)}
              {passar.resolve ? " (resolve)" : " (alivia)"}.
              <LinkEap projetoId={linhaProjetoId(passar.linhaId)} />
            </li>
          )}
        </ul>
      )}
      {sugestoes != null && !atrasar && !passar && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nenhuma correção automática cabe sem mexer no prazo do projeto ou sobrecarregar outra pessoa — decisão de
          coordenação.
        </p>
      )}
    </li>
  );
}

function LinkEap({ projetoId }: { projetoId: string | undefined }) {
  if (!projetoId) return null;
  return (
    <Link href={`/projetos/${projetoId}/eap`} className="text-primary underline-offset-2 hover:underline">
      Abrir a EAP
    </Link>
  );
}
