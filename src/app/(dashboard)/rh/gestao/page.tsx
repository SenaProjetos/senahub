import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarRange, Clock, GraduationCap, ListChecks, Smile, Sprout, Users } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";

import { painelGestao } from "@/modules/rh/gestao/queries";
import { CLIMA_MINIMO } from "@/modules/rh/gestao/sinais";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dataCurta } from "@/lib/dias-iso";

export const metadata: Metadata = { title: "Gestão de pessoas" };

const horas = (min: number) => `${min < 0 ? "-" : "+"}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;

/**
 * Painel de gestão de pessoas (F6). Acesso: RH, sócios e coordenação (quem gere Recursos) —
 * decisão do dono. Separado de folha e do conteúdo de 1:1: aqui só há contagens e sinais.
 */
export default async function GestaoPessoasPage() {
  const user = await requireUser();
  const pode = user.gereRh || user.ehSocio === true || (await can(user, "recursos", "gerir"));
  if (!pode) redirect("/sem-permissao");
  const p = await painelGestao();
  const maxCap = Math.max(1, ...p.capacidadeDemanda.flatMap((s) => [s.capacidade, s.demanda]));

  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo="Gestão de pessoas" descricao="Capacidade, competências, entradas e saídas, férias e sinais de atenção explicáveis." />

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          <CardTitle className="text-base">Sinais de atenção ({p.sinais.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {p.sinais.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum sinal agora.</p>
          ) : (
            <ul className="divide-y rounded-sm border">
              {p.sinais.map((s, i) => (
                <li key={`${s.tipo}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      Fonte: {s.fonte} · {s.periodo}
                    </p>
                  </div>
                  <Link href={s.acao.href} className="shrink-0 text-xs font-medium text-foreground underline underline-offset-2 hover:text-primary">
                    {s.acao.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Pessoas ({p.pessoas.total})</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Contratação</p>
              <ul className="space-y-0.5">
                {p.pessoas.porContratacao.map(([k, n]) => (
                  <li key={k} className="flex justify-between gap-2"><span>{k}</span><span className="font-mono">{n}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Setor</p>
              <ul className="space-y-0.5">
                {p.pessoas.porSetor.map(([k, n]) => (
                  <li key={k} className="flex justify-between gap-2"><span>{k}</span><span className="font-mono">{n}</span></li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Capacidade × demanda (h)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {p.capacidadeDemanda.map((s) => (
              <div key={s.semana} className="space-y-0.5">
                <p className="flex justify-between text-xs text-muted-foreground">
                  <span>{s.semana}</span>
                  <span className={s.demanda > s.capacidade ? "font-medium text-destructive" : ""}>{s.demanda} de {s.capacidade} h</span>
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={`h-full ${s.demanda > s.capacidade ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, (s.demanda / maxCap) * 100)}%` }} />
                </div>
              </div>
            ))}
            <Link href="/recursos" className="block text-xs text-foreground underline underline-offset-2 hover:text-primary">Ver em Recursos</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ListChecks className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Entrada e saída</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{p.lifecycle.abertos} lista(s) em andamento · {p.lifecycle.pendentes} item(ns) pendente(s)</p>
            <p className={p.lifecycle.atrasados > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{p.lifecycle.atrasados} atrasado(s)</p>
            <Link href="/rh/admin" className="block text-xs text-foreground underline underline-offset-2 hover:text-primary">Abrir a fila do RH</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <GraduationCap className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Lacunas de competência ({p.lacunas.length})</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {p.lacunas.length === 0 ? (
              <p className="text-muted-foreground">Toda necessidade tem alguém no nível.</p>
            ) : (
              <ul className="space-y-1">
                {p.lacunas.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    {l.habilidade} nível {l.nivelMinimo}{" "}
                    <span className="text-muted-foreground">· {l.projeto}{l.prazo ? ` · prazo ${dataCurta(l.prazo)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Férias nos próximos 60 dias</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {p.ferias.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma férias aprovada no período.</p>
            ) : (
              <ul className="space-y-0.5">
                {p.ferias.map((f, i) => (
                  <li key={i} className="flex justify-between gap-2"><span>{f.nome}</span><span className="font-mono text-xs">{dataCurta(f.inicio)} a {dataCurta(f.fim)}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Banco de horas do mês</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Maiores saldos</p>
              <ul className="space-y-0.5">
                {p.banco.positivos.map((s) => (
                  <li key={s.userId} className="flex justify-between gap-2"><span className="truncate">{s.nome}</span><span className="font-mono text-xs">{horas(s.saldoMinutos)}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Mais negativos</p>
              <ul className="space-y-0.5">
                {p.banco.negativos.map((s) => (
                  <li key={s.userId} className="flex justify-between gap-2"><span className="truncate">{s.nome}</span><span className="font-mono text-xs text-destructive">{horas(s.saldoMinutos)}</span></li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Sprout className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Desenvolvimento</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className={p.umAUmVencidos > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{p.umAUmVencidos} encontro(s) 1:1 atrasado(s)</p>
            <p className="text-xs text-muted-foreground">O conteúdo dos 1:1 não aparece aqui.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Smile className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">Clima (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {"oculto" in p.clima ? (
              <p className="text-muted-foreground">Menos de {CLIMA_MINIMO} respostas no período: o recorte não aparece, para ninguém ser identificado.</p>
            ) : (
              <>
                <p>Média <span className="font-mono">{String(p.clima.media).replace(".", ",")}</span> de 5 · {p.clima.total} respostas</p>
                <ul className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  {p.clima.distribuicao.map((d) => (
                    <li key={d.humor}>{d.humor}: {d.qtd}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
