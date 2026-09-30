"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChartNoAxesColumn, ChevronRight, GanttChart } from "lucide-react";
import {
  FILTRO_SEM_DISCIPLINA,
  calcularResultados,
  pessoasDoResultado,
  type Custo,
  type DadosResultados,
  type Numeros,
} from "@/modules/projetos/resultados/resultados";
import { rotuloHoras } from "@/modules/planejamento/progresso-sugerido";
import { brl, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TODAS = "todas";

/** "R$ 1.200" e, se faltou taxa, quantas horas ficaram fora — desconhecido não vira zero. */
function textoCusto(c: Custo | null): string {
  if (!c || (c.valor === 0 && c.horasSemCusto === 0)) return "—";
  if (c.valor === 0) return "sem custo/hora";
  return c.horasSemCusto > 0 ? `${brl(c.valor)} + ${rotuloHoras(c.horasSemCusto)} sem custo` : brl(c.valor);
}

function Consumo({ n }: { n: Numeros }) {
  if (n.consumido == null) return <span className="text-muted-foreground">{n.apontadoH > 0 ? "sem previsto" : "—"}</span>;
  const estourou = n.consumido > 100;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
        <div
          className={cn("h-full rounded-full", estourou ? "bg-destructive" : n.consumido >= 85 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.min(100, n.consumido)}%` }}
        />
      </div>
      <span className={cn("tabular-nums", estourou && "font-semibold text-destructive")}>{n.consumido}%</span>
    </div>
  );
}

function celulasNumeros(n: Numeros, comCusto: boolean) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{rotuloHoras(n.previstoH)}</TableCell>
      <TableCell className="text-right tabular-nums">{rotuloHoras(n.apontadoH)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", n.saldoH < 0 && "text-destructive")}>{rotuloHoras(n.saldoH)}</TableCell>
      <TableCell className="text-right">
        <Consumo n={n} />
      </TableCell>
      {comCusto && (
        <>
          <TableCell className="text-right text-xs tabular-nums">{textoCusto(n.custoPrevisto)}</TableCell>
          <TableCell className="text-right text-xs tabular-nums">{textoCusto(n.custoApontado)}</TableCell>
        </>
      )}
    </>
  );
}

/**
 * Aba Resultados do projeto: horas previstas no cronograma × apontadas no ponto, por disciplina e por tarefa. A conta
 * é de `resultados.ts` (pura); os filtros a refazem aqui mesmo, sem ir ao servidor.
 */
export function ResultadosView({ projetoId, dados }: { projetoId: string; dados: DadosResultados }) {
  const [disciplina, setDisciplina] = useState(TODAS);
  const [pessoa, setPessoa] = useState(TODAS);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const comCusto = dados.custoHora != null;

  const pessoas = useMemo(() => pessoasDoResultado(dados), [dados]);
  const r = useMemo(
    () =>
      calcularResultados(dados, {
        disciplinaId: disciplina === TODAS ? null : disciplina,
        userId: pessoa === TODAS ? null : pessoa,
      }),
    [dados, disciplina, pessoa],
  );
  const semNada = dados.previstas.every((p) => !(p.horas > 0)) && dados.apontados.length === 0;
  const temSemDisciplina = calcularResultados(dados).disciplinas.some((d) => d.disciplinaId == null);

  const alternar = (chave: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  const rotuloDisciplina =
    disciplina === TODAS
      ? "Todas as disciplinas"
      : disciplina === FILTRO_SEM_DISCIPLINA
        ? "Sem disciplina"
        : (dados.disciplinas.find((d) => d.id === disciplina)?.nome ?? "Disciplina");
  const rotuloPessoa = pessoa === TODAS ? "Todas as pessoas" : (pessoas.find((p) => p.id === pessoa)?.nome ?? "Pessoa");

  if (semNada) {
    return (
      <div className="rounded-sm border border-dashed">
        <EmptyState
          icon={ChartNoAxesColumn}
          title="Ainda não há horas para comparar"
          description="O previsto vem das horas das pessoas nas linhas do cronograma; o apontado, do ponto. Quando houver um dos dois, o resultado aparece aqui."
          action={
            <Button variant="outline" render={<Link href={`/planejamento/${projetoId}`} />}>
              <GanttChart className="size-3.5" /> Abrir o cronograma
            </Button>
          }
          className="py-14"
        />
      </div>
    );
  }

  const colunas = comCusto ? 7 : 5;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Horas previstas no cronograma × horas apontadas no ponto{comCusto ? ", com o custo pelo custo/hora de cada pessoa" : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={disciplina} onValueChange={(v) => setDisciplina(v ?? TODAS)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por disciplina">
            <SelectValue>{rotuloDisciplina}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as disciplinas</SelectItem>
            {dados.disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nome}
              </SelectItem>
            ))}
            {temSemDisciplina && <SelectItem value={FILTRO_SEM_DISCIPLINA}>Sem disciplina</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={pessoa} onValueChange={(v) => setPessoa(v ?? TODAS)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por pessoa">
            <SelectValue>{rotuloPessoa}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as pessoas</SelectItem>
            {pessoas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" render={<Link href={`/planejamento/${projetoId}`} />}>
          <GanttChart className="size-3.5" /> Cronograma
        </Button>
      </div>

      <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", comCusto && "lg:grid-cols-6")}>
        <KpiCard variante="compacta" label="Previsto" valor={rotuloHoras(r.total.previstoH)} />
        <KpiCard variante="compacta" label="Apontado" valor={rotuloHoras(r.total.apontadoH)} />
        <KpiCard
          variante="compacta"
          label="Saldo"
          valor={<span className={cn(r.total.saldoH < 0 && "text-destructive")}>{rotuloHoras(r.total.saldoH)}</span>}
          detalhe={r.total.saldoH < 0 ? "passou do previsto" : undefined}
        />
        <KpiCard variante="compacta" label="Consumido" valor={r.total.consumido == null ? "—" : `${r.total.consumido}%`} />
        {comCusto && (
          <>
            <KpiCard variante="compacta" label="Custo previsto" valor={<span className="text-base">{textoCusto(r.total.custoPrevisto)}</span>} />
            <KpiCard variante="compacta" label="Custo apontado" valor={<span className="text-base">{textoCusto(r.total.custoApontado)}</span>} />
          </>
        )}
      </div>

      {r.disciplinas.length === 0 ? (
        <p className="rounded-sm border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma hora prevista ou apontada com esses filtros.
        </p>
      ) : (
        <div className="min-w-0 rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Disciplina / tarefa</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Apontado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Consumido</TableHead>
                {comCusto && (
                  <>
                    <TableHead className="text-right">Custo previsto</TableHead>
                    <TableHead className="text-right">Custo apontado</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.disciplinas.map((d) => {
                const chave = d.disciplinaId ?? FILTRO_SEM_DISCIPLINA;
                const aberta = abertas.has(chave);
                const temDetalhe = d.tarefas.length > 0 || d.semTarefaH > 0;
                return (
                  <Fragment key={chave}>
                    <TableRow className="bg-muted/40 font-medium">
                      <TableCell>
                        <button
                          type="button"
                          disabled={!temDetalhe}
                          aria-expanded={aberta}
                          onClick={() => alternar(chave)}
                          className="flex items-center gap-1.5 text-left font-semibold hover:underline disabled:no-underline"
                        >
                          <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", aberta && "rotate-90", !temDetalhe && "invisible")} />
                          {d.nome}
                          {d.tarefas.length > 0 && (
                            <span className="font-normal text-muted-foreground">
                              · {d.tarefas.length} {d.tarefas.length === 1 ? "tarefa" : "tarefas"}
                            </span>
                          )}
                        </button>
                      </TableCell>
                      {celulasNumeros(d, comCusto)}
                    </TableRow>
                    {aberta &&
                      d.tarefas.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="pl-8">
                            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{t.codigo ?? "—"}</span>
                            {t.nome}
                          </TableCell>
                          {celulasNumeros(t, comCusto)}
                        </TableRow>
                      ))}
                    {aberta && d.semTarefaH > 0 && (
                      <TableRow>
                        <TableCell className="pl-8 italic text-muted-foreground" title="Horas do ponto neste projeto que não escolheram uma tarefa do cronograma">
                          Sem tarefa do cronograma
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-right tabular-nums">{rotuloHoras(d.semTarefaH)}</TableCell>
                        <TableCell colSpan={colunas - 2} />
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Previsto: horas das pessoas nas atividades do cronograma (vagas por perfil entram no total, sem pessoa). Apontado:
        sessões do ponto no projeto — com a tarefa escolhida, a hora cai na linha; sem ela, em &ldquo;Sem tarefa do
        cronograma&rdquo;.
      </p>
    </div>
  );
}
