"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PiggyBank, Plus } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AbasCaixinhas } from "@/components/financeiro/caixinhas/abas";
import { CaixinhaDialog } from "@/components/financeiro/caixinhas/caixinha-dialog";
import { RecebimentosADistribuir } from "@/components/financeiro/caixinhas/recebimentos-a-distribuir";
import type { RecebimentoDto, RegraDto } from "@/modules/financeiro/distribuicao/queries";
import { MovimentoDialog, type TipoDoDialog } from "@/components/financeiro/caixinhas/movimento-dialog";
import { brlC } from "@/components/financeiro/planejador/formato";
import { Valor } from "@/components/financeiro/valor";
import { copiarTexto } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import {
  ACAO_AJUSTAR,
  ACAO_ARQUIVAR,
  ACAO_COPIAR_NOME,
  ACAO_EDITAR,
  ACAO_EXTRATO,
  ACAO_LIBERAR,
  ACAO_RESERVAR,
  ACAO_RESTAURAR,
  ACAO_TRANSFERIR,
  itensDeCaixinha,
} from "@/modules/financeiro/caixinhas/acoes";
import { arquivarCaixinha, restaurarCaixinha } from "@/modules/financeiro/caixinhas/actions";
import { resumoGeral } from "@/modules/financeiro/caixinhas/calculo";
import type { CaixinhaDto, MovimentoDto } from "@/modules/financeiro/caixinhas/queries";
import { diaMes } from "@/modules/financeiro/liquidez/datas";

const ROTULO_TIPO: Record<MovimentoDto["tipo"], string> = {
  alocacao: "Reserva",
  liberacao: "Liberação",
  transferencia: "Transferência",
  ajuste: "Ajuste",
};

const dataBr = (d: string) => `${diaMes(d)}/${d.slice(0, 4)}`;

/** Quanto falta, em texto e cor: a cor reforça, nunca é o único sinal. */
function faltaDe(c: CaixinhaDto): { texto: string; classe: string } {
  const s = c.situacao;
  if (s.estado === "sem_meta") return { texto: "Sem meta definida", classe: "text-muted-foreground" };
  // Por compromissos, necessidade zero é "nada a pagar no horizonte", não uma meta cumprida.
  if (c.regra === "compromissos_ligados" && s.necessidade === 0) return { texto: `Nada a pagar nos próximos ${c.horizonteDias} dias`, classe: "text-muted-foreground" };
  if (s.estado === "completa") return { texto: "Completa", classe: "text-success" };
  return { texto: `Faltam ${brlC(s.falta ?? 0)}`, classe: (s.percentual ?? 0) < 50 ? "text-destructive" : "text-warning" };
}

/**
 * Caixinhas (mock "Caixinhas"): quanto do caixa já tem destino. Separação gerencial — nenhum
 * dinheiro muda de banco. Cartões com menu de contexto e `...` (ADR-0002) e o extrato de movimentos.
 * "Regras de distribuição" e "Recebimentos a distribuir" chegam na F5.
 */
export function CaixinhasView({
  caixinhas,
  movimentos,
  caixaAtual,
  hoje,
  aba,
  arquivadas,
  caixinhaDoExtrato,
  podeGerir,
  recebimentos,
  regras,
  distribuirDesde,
  subnav,
}: {
  caixinhas: CaixinhaDto[];
  movimentos: MovimentoDto[];
  /** Centavos. */
  caixaAtual: number;
  hoje: string;
  aba: "caixinhas" | "extrato";
  arquivadas: boolean;
  caixinhaDoExtrato: string | null;
  podeGerir: boolean;
  /** Receitas realizadas esperando distribuição (vazio fora da aba de cartões). */
  recebimentos: RecebimentoDto[];
  regras: RegraDto[];
  distribuirDesde: string | null;
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, iniciar] = useTransition();
  const [edicao, setEdicao] = useState<{ aberto: boolean; caixinha: CaixinhaDto | null }>({ aberto: false, caixinha: null });
  const [mov, setMov] = useState<{ aberto: boolean; tipo: TipoDoDialog; origemId: string | null }>({ aberto: false, tipo: "alocacao", origemId: null });

  const ativas = useMemo(() => caixinhas.filter((c) => c.ativo), [caixinhas]);
  const resumo = resumoGeral(caixaAtual, ativas.map((c) => c.situacao.reservado));
  const comprometido = ativas.reduce((s, c) => s + c.comprometido30, 0);
  const coberto = ativas.reduce((s, c) => s + Math.min(c.situacao.reservado, c.comprometido30), 0);
  const pctCoberto = comprometido > 0 ? Math.round((coberto / comprometido) * 100) : 100;

  const abrirMov = (tipo: TipoDoDialog, origemId: string | null = null) => setMov({ aberto: true, tipo, origemId });
  const irParaExtrato = (id: string | null) => router.push(`/financeiro/caixinhas?aba=extrato${id ? `&caixinha=${encodeURIComponent(id)}` : ""}`);

  async function aoSelecionar(c: CaixinhaDto, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" })))
      return;
    const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
      iniciar(async () => {
        const r = await p;
        if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
        toast.success(ok);
        router.refresh();
      });
    if (item.id === ACAO_RESERVAR) abrirMov("alocacao", c.id);
    else if (item.id === ACAO_LIBERAR) abrirMov("liberacao", c.id);
    else if (item.id === ACAO_TRANSFERIR) abrirMov("transferencia", c.id);
    else if (item.id === ACAO_AJUSTAR) abrirMov("ajuste", c.id);
    else if (item.id === ACAO_EXTRATO) irParaExtrato(c.id);
    else if (item.id === ACAO_EDITAR) setEdicao({ aberto: true, caixinha: c });
    else if (item.id === ACAO_ARQUIVAR) rodar(arquivarCaixinha({ id: c.id }), "Caixinha arquivada.");
    else if (item.id === ACAO_RESTAURAR) rodar(restaurarCaixinha({ id: c.id }), "Caixinha restaurada.");
    else if (item.id === ACAO_COPIAR_NOME) {
      if (await copiarTexto(c.nome)) toast.success("Copiado.");
      else toast.error("Não foi possível copiar.");
    }
  }

  const itensGerais = podeGerir
    ? [
        { tipo: "acao" as const, id: ACAO_LIBERAR, rotulo: "Liberar valor" },
        { tipo: "acao" as const, id: ACAO_TRANSFERIR, rotulo: "Transferir entre caixinhas…" },
        { tipo: "acao" as const, id: ACAO_AJUSTAR, rotulo: "Ajustar o alocado…" },
      ]
    : [];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Caixinhas"
        descricao="Quanto do caixa já tem destino. Separação gerencial: nenhum dinheiro muda de banco."
        acoes={
          podeGerir ? (
            <>
              <Button size="sm" onClick={() => abrirMov("alocacao")} disabled={ativas.length === 0}>
                Reservar valor
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEdicao({ aberto: true, caixinha: null })}>
                <Plus className="size-4" aria-hidden /> Nova caixinha
              </Button>
              <BotaoAcoes
                itens={itensGerais}
                rotulo="Mais ações das caixinhas"
                onSelect={(item) => abrirMov(item.id === ACAO_LIBERAR ? "liberacao" : item.id === ACAO_TRANSFERIR ? "transferencia" : "ajuste")}
              />
            </>
          ) : undefined
        }
      />
      {subnav}

      <AbasCaixinhas ativa={aba} />

      {aba === "caixinhas" ? (
        <>
          <section aria-label="Resumo" className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-sm border bg-card px-5 py-4 shadow-[var(--card-shadow)]">
            <div>
              <p className="text-[13px] text-muted-foreground">Caixa nas contas</p>
              <Valor valor={resumo.caixa / 100} sentido="neutro" className="text-2xl font-semibold" />
            </div>
            <span aria-hidden className="pb-1 font-mono text-xl text-muted-foreground">
              =
            </span>
            <div>
              <p className="text-[13px] text-muted-foreground">Reservado</p>
              <Valor valor={resumo.reservado / 100} sentido="neutro" className="text-2xl font-semibold" />
            </div>
            <span aria-hidden className="pb-1 font-mono text-xl text-muted-foreground">
              +
            </span>
            <div>
              <p className="text-[13px] text-muted-foreground">Livre</p>
              <Valor valor={resumo.livre / 100} sentido="neutro" className="text-2xl font-semibold" />
            </div>
            {resumo.descoberto > 0 && (
              <p role="status" className="basis-full rounded-sm border border-destructive/50 bg-destructive/5 px-3 py-2 text-[13px]">
                <b>Reserva descoberta: {brlC(resumo.descoberto)}.</b> As caixinhas somam mais do que o caixa nas contas.
              </p>
            )}
            <div className="ml-auto min-w-64 max-w-sm flex-1">
              <p className="text-[13.5px]">Compromissos dos próximos 30 dias ligados a caixinhas</p>
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-lg font-semibold">{brlC(comprometido)}</span>
                <span className="font-mono text-sm text-muted-foreground">
                  cobertos {brlC(coberto)} ({pctCoberto}%)
                </span>
              </p>
              <Progress valor={pctCoberto} rotulo={`${pctCoberto}% dos compromissos ligados a caixinhas estão cobertos`} tom={pctCoberto >= 100 ? "sucesso" : pctCoberto >= 50 ? "alerta" : "perigo"} className="mt-1.5" />
            </div>
          </section>

          <div className={cn("grid grid-cols-[minmax(0,1fr)] items-start gap-4", !arquivadas && "xl:grid-cols-[minmax(0,1fr)_23rem]")}>
          <div className="min-w-0 space-y-4">
          {caixinhas.length === 0 ? (
            <section className="rounded-sm border bg-card">
              <EmptyState
                icon={PiggyBank}
                title={arquivadas ? "Nenhuma caixinha arquivada." : "Nenhuma caixinha ainda."}
                description={arquivadas ? undefined : "Crie uma caixinha para separar parte do caixa para uma finalidade."}
                action={
                  podeGerir && !arquivadas ? (
                    <Button size="sm" onClick={() => setEdicao({ aberto: true, caixinha: null })}>
                      Nova caixinha
                    </Button>
                  ) : undefined
                }
              />
            </section>
          ) : (
            <>
              <DicaMenuContexto />
              <section aria-label="Caixinhas" className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-4">
                {caixinhas.map((c) => renderCartao(c))}
                {podeGerir && !arquivadas && (
                  <button
                    type="button"
                    onClick={() => setEdicao({ aberto: true, caixinha: null })}
                    className="flex min-h-48 flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed text-muted-foreground hover:bg-muted/30"
                  >
                    <Plus className="size-5" aria-hidden />
                    <span className="font-semibold">Nova caixinha</span>
                    <span className="text-[12.5px]">Ex.: Equipamentos, Seguro, Viagens</span>
                  </button>
                )}
              </section>
            </>
          )}
          <p className="text-[13px]">
            <Link className="underline underline-offset-2" href={arquivadas ? "/financeiro/caixinhas" : "/financeiro/caixinhas?arquivadas=1"}>
              {arquivadas ? "Ver as caixinhas ativas" : "Ver caixinhas arquivadas"}
            </Link>
          </p>
          </div>
          {!arquivadas && (
            <RecebimentosADistribuir
              recebimentos={recebimentos}
              regras={regras}
              nomesDeCaixinha={Object.fromEntries(ativas.map((c) => [c.id, c.nome]))}
              distribuirDesde={distribuirDesde}
              podeGerir={podeGerir}
              hoje={hoje}
            />
          )}
          </div>
        </>
      ) : (
        <Extrato movimentos={movimentos} caixinhas={caixinhas} caixinhaId={caixinhaDoExtrato} />
      )}

      <CaixinhaDialog aberto={edicao.aberto} caixinha={edicao.caixinha} onFechar={() => setEdicao({ aberto: false, caixinha: null })} />
      <MovimentoDialog
        aberto={mov.aberto}
        tipo={mov.tipo}
        origemId={mov.origemId}
        caixinhas={ativas}
        hoje={hoje}
        caixaAtual={caixaAtual}
        reservadoTotal={resumo.reservado}
        onFechar={() => setMov((m) => ({ ...m, aberto: false }))}
      />
    </div>
  );

  // Função de renderização, NÃO componente: um componente definido aqui dentro remontaria os cartões
  // a cada render e fecharia o menu de contexto aberto (ADR-0002).
  function renderCartao(c: CaixinhaDto) {
    const s = c.situacao;
    const itens = itensDeCaixinha({ nome: c.nome, ativo: c.ativo, reservado: s.reservado, abertas: c.abertas }, { podeGerir });
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionar(c, item);
    const falta = faltaDe(c);
    const pct = s.percentual;
    const semNecessidade = c.regra === "compromissos_ligados" && s.necessidade === 0;
    return (
      <LinhaComMenu key={c.id} itens={itens} onSelect={aoEscolher} render={<article className={cn("flex flex-col gap-2 rounded-sm border bg-card p-4 shadow-[var(--card-shadow)] data-[popup-open]:bg-muted/30", !c.ativo && "opacity-70")} />}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[15px] font-bold">
            <span className="block truncate">{c.nome}</span>
            {c.descricao && <span className="block truncate text-xs font-normal text-muted-foreground">{c.descricao}</span>}
          </h2>
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações da caixinha ${c.nome}`} className="size-8" />
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Valor valor={s.reservado / 100} sentido="neutro" className="text-2xl font-semibold" />
          <span className="text-[13px] text-muted-foreground">
            {s.necessidade == null ? "sem meta" : s.necessidade === 0 && c.regra === "compromissos_ligados" ? "sem compromissos" : `de ${brlC(s.necessidade)}`}
          </span>
        </p>
        <div className="flex items-center gap-2.5">
          <Progress className="flex-1" valor={semNecessidade ? 0 : (pct ?? 0)} rotulo={pct == null || semNecessidade ? `${c.nome}: sem necessidade definida` : `${c.nome}: ${pct}% da necessidade`} tom={s.estado === "completa" ? "sucesso" : (pct ?? 0) < 50 ? "perigo" : "alerta"} />
          <span className="w-10 text-right font-mono text-[12.5px]">{pct == null || semNecessidade ? "—" : `${pct}%`}</span>
        </div>
        <p className={cn("text-[13px] font-semibold", falta.classe)}>{falta.texto}</p>
        {s.usoAlem > 0 && <p className="text-xs text-warning">O uso passou do reservado em {brlC(s.usoAlem)}: o livre já caiu por isso.</p>}
        <hr className="border-border" />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[12.5px]">
          <dt className="text-muted-foreground">Próximo uso</dt>
          <dd className="truncate">{s.proximoUso ? `${diaMes(s.proximoUso.data)}, ${s.proximoUso.descricao} (${brlC(s.proximoUso.valor)})` : "sem uso programado"}</dd>
          <dt className="text-muted-foreground">Necessidade</dt>
          <dd>{c.regra === "meta_fixa" ? (c.meta != null ? "Meta fixa" : "Meta fixa, ainda sem valor") : `Compromissos ligados, ${c.horizonteDias} dias`}</dd>
        </dl>
        {!c.ativo && <p className="text-xs text-muted-foreground">Arquivada.</p>}
      </LinhaComMenu>
    );
  }
}

function Extrato({ movimentos, caixinhas, caixinhaId }: { movimentos: MovimentoDto[]; caixinhas: CaixinhaDto[]; caixinhaId: string | null }) {
  const router = useRouter();
  return (
    <section aria-label="Extrato de movimentos" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ex-cx" className="text-[13px] text-muted-foreground">
          Caixinha
        </label>
        <Select
          value={caixinhaId ?? "todas"}
          onValueChange={(v) => router.push(`/financeiro/caixinhas?aba=extrato${v && v !== "todas" ? `&caixinha=${encodeURIComponent(v)}` : ""}`)}
          items={{ todas: "Todas", ...Object.fromEntries(caixinhas.map((c) => [c.id, c.nome])) }}
        >
          <SelectTrigger id="ex-cx" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {caixinhas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-sm border bg-card shadow-[var(--card-shadow)]">
        {movimentos.length === 0 ? (
          <EmptyState icon={PiggyBank} title="Nenhum movimento ainda." description="Reservar, liberar, transferir e ajustar aparecem aqui." />
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Caixinha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Observação</th>
                <th className="px-3 py-2">Por</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{dataBr(m.data)}</td>
                  <td className="px-3 py-2">{m.caixinhaNome}</td>
                  <td className="px-3 py-2">{ROTULO_TIPO[m.tipo]}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Valor valor={m.valor / 100} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{m.descricao ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{m.autor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Mostra os 300 movimentos mais recentes. Valor com sinal: reservas somam, liberações e saídas de transferência subtraem.</p>
    </section>
  );
}
