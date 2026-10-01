"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FolderOpen, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { Valor } from "@/components/financeiro/valor";
import { Agenda, gruposDaAgenda } from "@/components/financeiro/planejador/agenda";
import { brlC, rotuloDia } from "@/components/financeiro/planejador/formato";
import { LinhaDoTempo } from "@/components/financeiro/planejador/linha-do-tempo";
import { PainelEvento } from "@/components/financeiro/planejador/painel-evento";
import { PainelImpacto, type ItemAjuste } from "@/components/financeiro/planejador/painel-impacto";
import { AplicarDialog } from "@/components/financeiro/planejador/aplicar-dialog";
import { ReservaMinimaDialog } from "@/components/financeiro/planejador/reserva-minima-dialog";
import { SalvarCenarioDialog } from "@/components/financeiro/planejador/salvar-cenario-dialog";
import { SimularMovimento, type CategoriaOpcao } from "@/components/financeiro/planejador/simular-movimento";
import { estadoDoAjuste } from "@/modules/financeiro/liquidez/ajustes";
import type { CenarioDto } from "@/modules/financeiro/planejador/cenarios/queries";
import { nomePadraoDoCenario } from "@/modules/financeiro/planejador/cenarios/resumo";
import { HORIZONTES_DIAS, type ConfigLiquidez } from "@/modules/financeiro/config/liquidez";
import { resumoDoAlerta } from "@/modules/financeiro/liquidez/alerta";
import {
  CONFIANCAS_DO_EIXO,
  eventoNoCenario,
  PRESETS,
  presetDosEixos,
  type EixoCompromissos,
  type EixoEntradas,
  type Eixos,
} from "@/modules/financeiro/liquidez/cenario";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import type { BasePlanejador } from "@/modules/financeiro/liquidez/queries";
import {
  ajustesSemAlvo,
  alvoDoAjuste,
  aplicarSimulacao,
  descreverAjuste,
  PREFIXO_SIMULADO,
  registrarAjuste,
  type AjusteSimulado,
  type MovimentoSimulado,
} from "@/modules/financeiro/liquidez/simulacao";
import type { Confianca, DataIso, EventoCaixa, Observado, Prioridade } from "@/modules/financeiro/liquidez/tipos";
import {
  ACAO_COPIAR_DESCRICAO,
  ACAO_COPIAR_VALOR,
  ACAO_DETALHES,
  ACAO_INCLUIR,
  ACAO_REMOVER_SIMULADO,
  ACAO_SIMULAR_DATA,
  ACAO_TIRAR,
  ACAO_VOLTAR,
  itensDeEventoDoPlanejador,
  PREFIXO_CONFIANCA,
  PREFIXO_PRIORIDADE,
  ROTULOS_CONFIANCA,
} from "@/modules/financeiro/planejador/acoes";
import { CHAVE_RASCUNHO, escreverRascunho, lerRascunho, RASCUNHO_VAZIO } from "@/modules/financeiro/planejador/rascunho";
import { copiarTexto } from "@/lib/clipboard";
import type { Centavos } from "@/modules/financeiro/liquidez/tipos";

const EIXO_ENTRADAS: { id: EixoEntradas; rotulo: string }[] = [
  { id: "confirmadas", rotulo: "Confirmadas pelo cliente" },
  { id: "provaveis", rotulo: "+ Prováveis" },
  { id: "estimadas", rotulo: "+ Estimadas" },
  { id: "todas", rotulo: "Todas, até incertas" },
];
const EIXO_COMPROMISSOS: { id: EixoCompromissos; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "p1p2", rotulo: "P1 e P2" },
  { id: "p1", rotulo: "Só P1" },
];

function novoIdAjuste(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Planejador de caixa (mockup aprovado + spec 2026-09-30). Mesa de simulação: o servidor entrega a
 * base (caixa atual e pendentes) e TODO o resto roda aqui, no navegador, com o motor puro. Sem
 * cenário aberto, os ajustes ficam na sessão do navegador; com cenário (`?cenario=`), começam dele e
 * só voltam ao banco em "Salvar". O financeiro só muda em "Aplicar ao financeiro" (F3, `gerir`).
 */
export function PlanejadorView({
  base,
  config,
  podeGerir,
  podeSalvar,
  cenario,
  cenarioEditavel,
  observadosExtras,
  categorias,
  subnav,
}: {
  base: BasePlanejador;
  config: ConfigLiquidez;
  podeGerir: boolean;
  /** `financeiro:ver` — o sócio que só lê simula, mas não salva (I11). */
  podeSalvar: boolean;
  cenario: CenarioDto | null;
  cenarioEditavel: boolean;
  /** Foto de agora dos alvos do cenário que não estão na projeção (pagos, excluídos, além do horizonte). */
  observadosExtras: Record<string, Observado | null>;
  categorias: CategoriaOpcao[];
  subnav?: React.ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [eixos, setEixos] = useState<Eixos>(cenario?.premissas.eixos ?? RASCUNHO_VAZIO.eixos);
  const [ajustes, setAjustes] = useState<AjusteSimulado[]>(cenario?.ajustes ?? []);
  // O que está salvo no cenário aberto — para dizer "alterações não salvas".
  const [salvo, setSalvo] = useState<string | null>(() =>
    cenario ? escreverRascunho({ eixos: cenario.premissas.eixos, ajustes: cenario.ajustes }) : null,
  );
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [aplicarAberto, setAplicarAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<{ id: string; focarData: boolean } | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [reservaAberta, setReservaAberta] = useState(false);
  const carregou = useRef(false);

  // Rascunho (sem cenário aberto): lido depois da hidratação (sessionStorage não existe no servidor)
  // e salvo a cada mudança. Rascunho de antes da F3 não tem a foto "antes": ela vem da base agora.
  useEffect(() => {
    if (cenario) return;
    try {
      const r = lerRascunho(window.sessionStorage.getItem(CHAVE_RASCUNHO));
      if (r) {
        const porId = new Map(base.eventos.map((e) => [e.id, e]));
        setEixos(r.eixos);
        setAjustes(
          r.ajustes.map((a) => {
            if (a.tipo === "INCLUIR" || a.antes) return a;
            const e = porId.get(a.eventoId);
            return e?.observado ? { ...a, antes: e.observado, rotulo: a.rotulo ?? e.descricao } : a;
          }),
        );
      }
    } catch {
      // Sem acesso ao armazenamento (aba privada, bloqueio): a simulação só não sobrevive ao recarregar.
    }
    carregou.current = true;
    // Só na montagem: a base que chega depois (outro horizonte) não reescreve o rascunho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (cenario || !carregou.current) return;
    try {
      window.sessionStorage.setItem(CHAVE_RASCUNHO, escreverRascunho({ eixos, ajustes }));
    } catch {
      /* idem */
    }
  }, [cenario, eixos, ajustes]);

  const fim = useMemo(() => {
    const d = new Date(`${base.hoje}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + base.horizonteDias - 1);
    return d.toISOString().slice(0, 10);
  }, [base.hoje, base.horizonteDias]);

  const entradaMotor = useCallback(
    (eventos: readonly EventoCaixa[]) => ({
      hoje: base.hoje,
      horizonteDias: base.horizonteDias,
      caixaAtual: base.caixaAtual,
      reservaMinima: base.reservaMinima,
      eventos,
      caixinhas: base.caixinhas,
      eixos,
    }),
    [base, eixos],
  );

  const eventos = useMemo(() => aplicarSimulacao(base.eventos, ajustes, base.hoje), [base.eventos, ajustes, base.hoje]);
  const projecao = useMemo(() => projetar(entradaMotor(eventos)), [entradaMotor, eventos]);
  const antes = useMemo(() => (ajustes.length ? projetar(entradaMotor(base.eventos)) : null), [ajustes.length, entradaMotor, base.eventos]);
  const alerta = useMemo(() => resumoDoAlerta(projecao, eventos, base.reservaMinima), [projecao, eventos, base.reservaMinima]);
  const semAlvo = useMemo(() => ajustesSemAlvo(base.eventos, ajustes), [base.eventos, ajustes]);
  const eventoPorId = useMemo(() => new Map(eventos.map((e) => [e.id, e])), [eventos]);
  const baseOriginalPorId = useMemo(() => new Map(base.eventos.map((e) => [e.id, e])), [base.eventos]);
  const projetadoPorId = useMemo(() => new Map(projecao.eventos.map((p) => [p.id, p])), [projecao.eventos]);

  const registrar = useCallback(
    (novo: AjusteSimulado) => {
      const alvo = alvoDoAjuste(novo);
      const original = alvo ? baseOriginalPorId.get(alvo) : undefined;
      // A foto "antes" (spec §6) é a do lançamento como estava ao simular: é com ela que o
      // "aplicar" descobre que o real mudou. O rótulo diz qual era, se ele sumir.
      const comFoto: AjusteSimulado =
        novo.tipo !== "INCLUIR" && original?.observado ? { ...novo, antes: original.observado, rotulo: original.descricao } : novo;
      setAjustes((atual) => registrarAjuste(atual, comFoto, original));
    },
    [baseOriginalPorId],
  );

  const alternar = useCallback(
    (e: EventoCaixa) => {
      if (e.origem === "simulado") {
        const id = e.id.slice(PREFIXO_SIMULADO.length);
        setAjustes((a) => a.filter((x) => !(x.tipo === "INCLUIR" && x.id === id)));
      } else if (e.simulacao?.excluido) {
        setAjustes((a) => a.filter((x) => !(x.tipo === "EXCLUIR" && x.eventoId === e.id)));
      } else if (e.simulacao?.forcado && !eventoNoCenario(e, eixos)) {
        setAjustes((a) => a.filter((x) => !(x.tipo === "FORCAR_INCLUSAO" && x.eventoId === e.id)));
      } else if (!eventoNoCenario(e, eixos)) {
        registrar({ tipo: "FORCAR_INCLUSAO", eventoId: e.id });
      } else {
        registrar({ tipo: "EXCLUIR", eventoId: e.id });
      }
    },
    [eixos, registrar],
  );

  const aoSelecionar = useCallback(
    async (e: EventoCaixa, item: AcaoItemAcao) => {
      if (item.confirmar) {
        const ok = await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" });
        if (!ok) return;
      }
      if (item.id === ACAO_DETALHES) return setSelecionado({ id: e.id, focarData: false });
      if (item.id === ACAO_SIMULAR_DATA) return setSelecionado({ id: e.id, focarData: true });
      if (item.id === ACAO_TIRAR || item.id === ACAO_VOLTAR || item.id === ACAO_INCLUIR || item.id === ACAO_REMOVER_SIMULADO) return alternar(e);
      if (item.id.startsWith(PREFIXO_PRIORIDADE)) return registrar({ tipo: "ALTERAR_PRIORIDADE", eventoId: e.id, prioridade: item.id.slice(PREFIXO_PRIORIDADE.length) as Prioridade });
      if (item.id.startsWith(PREFIXO_CONFIANCA)) return registrar({ tipo: "ALTERAR_CONFIANCA", eventoId: e.id, confianca: item.id.slice(PREFIXO_CONFIANCA.length) as Confianca });
      if (item.id === ACAO_COPIAR_VALOR || item.id === ACAO_COPIAR_DESCRICAO) {
        const texto = item.id === ACAO_COPIAR_VALOR ? brlC(e.valor) : e.descricao;
        if (await copiarTexto(texto)) toast.success("Copiado.");
        else toast.error("Não foi possível copiar.");
      }
    },
    [alternar, confirm, registrar],
  );

  const grupos = useMemo(
    () =>
      gruposDaAgenda(
        eventos,
        projecao.eventos,
        projecao.serie,
        base.reservaMinima,
        (e) => eventoNoCenario(e, eixos),
        (e, nc) => itensDeEventoDoPlanejador({ ...e, noCenario: nc }),
        fim,
      ),
    [eventos, projecao, base.reservaMinima, eixos, fim],
  );
  const alemDoHorizonte = projecao.eventos.filter((p) => p.foraDoHorizonte).length;

  const itensAjuste: ItemAjuste[] = ajustes.map((a, i) => {
    const alvo = alvoDoAjuste(a);
    const original = alvo ? baseOriginalPorId.get(alvo) : undefined;
    const atual: Observado | null | undefined = alvo ? (original?.observado ?? observadosExtras[alvo]) : undefined;
    const estado = atual === undefined ? null : estadoDoAjuste(a, atual);
    const guardado =
      a.tipo !== "INCLUIR" && a.rotulo ? { descricao: a.rotulo, data: a.antes?.data ?? "", prioridade: null, confianca: null } : undefined;
    return {
      chave: `${i}:${a.tipo}:${alvo ?? (a.tipo === "INCLUIR" ? a.id : "")}`,
      texto: descreverAjuste(a, original ?? guardado),
      aviso: estado && estado.estado !== "valido" ? estado.motivo : null,
      onDesfazer: () => setAjustes((atual) => atual.filter((x) => x !== a)),
    };
  });
  const alterado = salvo !== null && escreverRascunho({ eixos, ajustes }) !== salvo;
  const premissas = { eixos, horizonteDias: base.horizonteDias };
  const hrefHorizonte = (h: number) => `?horizonte=${h}${cenario ? `&cenario=${encodeURIComponent(cenario.id)}` : ""}`;

  async function descartar() {
    const ok = await confirm({ title: "Descartar a simulação?", description: `${ajustes.length} ${ajustes.length === 1 ? "ajuste sai" : "ajustes saem"} desta aba. O financeiro não muda.`, confirmLabel: "Descartar", variant: "destructive" });
    if (ok) setAjustes([]);
  }

  const evSel = selecionado ? (eventoPorId.get(selecionado.id) ?? null) : null;
  const preset = presetDosEixos(eixos);
  const necessidade = projecao.necessidade;
  const anomalias = [
    base.anomalias.dataFutura.quantidade > 0 && `${base.anomalias.dataFutura.quantidade} lançamento(s) pago(s) com data futura (${brlC(base.anomalias.dataFutura.valor)}) já estão no caixa atual.`,
    base.anomalias.contaInativa.quantidade > 0 && `${base.anomalias.contaInativa.quantidade} lançamento(s) de conta inativa (${brlC(base.anomalias.contaInativa.valor)}) entram no caixa sem o saldo inicial da conta.`,
    base.anomalias.semConta.quantidade > 0 && `${base.anomalias.semConta.quantidade} lançamento(s) pago(s) sem conta (${brlC(base.anomalias.semConta.valor)}).`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Planejador de caixa"
        descricao="Teste decisões antes de executar. A simulação não muda o financeiro."
        acoes={
          <>
            <Button size="sm" variant="outline" render={<Link href="/financeiro/cenarios" />}>
              <FolderOpen className="size-4" aria-hidden /> Cenários salvos
            </Button>
            <Button size="sm" onClick={() => setNovoAberto(true)}>
              <Plus className="size-4" aria-hidden /> Simular movimento
            </Button>
          </>
        }
      />
      {subnav}

      {cenario && (
        <section
          aria-label="Cenário aberto"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-l-[3px] border-l-primary bg-card px-3 py-2 text-[13.5px]"
        >
          <span>
            Cenário <b>{cenario.nome}</b>
          </span>
          {cenario.situacao === "arquivado" && <span className="rounded-sm border px-1.5 text-xs">Arquivado</span>}
          {alterado && <span className="font-medium text-warning">Alterações não salvas</span>}
          {cenario.nAplicados > 0 && cenario.aplicadoEm && (
            <span className="text-muted-foreground">
              {cenario.nAplicados} {cenario.nAplicados === 1 ? "ajuste já aplicado" : "ajustes já aplicados"} em {diaMes(cenario.aplicadoEm.slice(0, 10))}
            </span>
          )}
          {cenario.nInvalidos > 0 && (
            <span className="text-warning">
              {cenario.nInvalidos} {cenario.nInvalidos === 1 ? "ajuste ficou de fora" : "ajustes ficaram de fora"} (formato antigo)
            </span>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" render={<Link href="/financeiro/planejador" />}>
            Fechar cenário
          </Button>
        </section>
      )}

      <section aria-label="Premissas da simulação" className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-sm border bg-card px-4 py-3 shadow-[var(--card-shadow)]">
        <div>
          <p className="text-[13px] text-muted-foreground">Caixa atual</p>
          <Valor valor={base.caixaAtual / 100} sentido="neutro" className="text-xl font-semibold" />
        </div>
        <div>
          <p className="text-[13px] text-muted-foreground">Reserva mínima (piso do caixa)</p>
          <p className="flex items-center gap-1">
            {base.reservaMinima > 0 ? (
              <Valor valor={base.reservaMinima / 100} sentido="neutro" className="text-xl font-semibold" />
            ) : (
              <span className="text-sm text-muted-foreground">não definida</span>
            )}
            {podeGerir && (
              <Button variant="ghost" size="icon-sm" aria-label="Editar reserva mínima" onClick={() => setReservaAberta(true)}>
                <Pencil className="size-3.5" aria-hidden />
              </Button>
            )}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[13px] text-muted-foreground">Horizonte</p>
          <div role="group" aria-label="Horizonte" className="flex flex-wrap gap-1">
            {HORIZONTES_DIAS.map((h) => (
              <Button
                key={h}
                size="sm"
                variant={base.horizonteDias === h ? "default" : "outline"}
                render={<Link href={hrefHorizonte(h)} scroll={false} aria-current={base.horizonteDias === h ? "true" : undefined} />}
              >
                {h} dias
              </Button>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <p className="mb-1 text-[13px] text-muted-foreground">Cenário</p>
          <div role="group" aria-label="Cenário" className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button key={p.id} size="sm" variant={preset === p.id ? "default" : "outline"} aria-pressed={preset === p.id} onClick={() => setEixos(p.eixos)}>
                {p.nome}
              </Button>
            ))}
            <Button size="sm" variant={preset === "personalizado" ? "default" : "outline"} aria-pressed={preset === "personalizado"} onClick={() => setEixos({ entradas: "estimadas", compromissos: "todos" })}>
              Personalizado
            </Button>
          </div>
        </div>
        <div className="flex basis-full flex-wrap items-center gap-x-7 gap-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">Entradas</span>
            <div role="group" aria-label="Entradas consideradas" className="flex flex-wrap gap-1">
              {EIXO_ENTRADAS.map((o) => (
                <Button key={o.id} size="sm" variant={eixos.entradas === o.id ? "default" : "outline"} aria-pressed={eixos.entradas === o.id} onClick={() => setEixos((x) => ({ ...x, entradas: o.id }))}>
                  {o.rotulo}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">Compromissos</span>
            <div role="group" aria-label="Compromissos considerados" className="flex flex-wrap gap-1">
              {EIXO_COMPROMISSOS.map((o) => (
                <Button key={o.id} size="sm" variant={eixos.compromissos === o.id ? "default" : "outline"} aria-pressed={eixos.compromissos === o.id} onClick={() => setEixos((x) => ({ ...x, compromissos: o.id }))}>
                  {o.rotulo}
                </Button>
              ))}
            </div>
          </div>
          <span className="text-[12.5px] text-muted-foreground">
            Entradas: {CONFIANCAS_DO_EIXO[eixos.entradas].map((c) => ROTULOS_CONFIANCA[c].toLowerCase()).join(", ")}.
          </span>
        </div>
      </section>

      {(anomalias.length > 0 || projecao.avisos.length > 0 || base.reservaMinima === 0) && (
        <section aria-label="Avisos sobre os dados" className="flex flex-col gap-1 rounded-sm border border-warning/40 bg-warning/5 px-3 py-2 text-[13px]">
          {base.reservaMinima === 0 && <p>Reserva mínima não definida: o planejador só avisa quando o caixa fica negativo.</p>}
          {anomalias.map((a) => (
            <p key={a}>{a} O saldo pode divergir do banco.</p>
          ))}
          {projecao.avisos.map((a) => (
            <p key={`${a.eventoId}:${a.mensagem}`}>{a.mensagem}</p>
          ))}
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Resultado da simulação" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <KpiCard variante="indicador" label={`Saldo em ${diaMes(projecao.fim)}`} valor={<Valor valor={projecao.fimDoHorizonte.caixa / 100} sentido="neutro" />} detalhe={preset === "personalizado" ? "Personalizado" : PRESETS.find((p) => p.id === preset)?.nome} />
            <KpiCard variante="indicador" label="Menor saldo" valor={<Valor valor={projecao.menorSaldo.valor / 100} sentido="neutro" />} detalhe={`em ${rotuloDia(projecao.menorSaldo.dia)}`} />
            <KpiCard
              variante="indicador"
              label="Margem até a reserva"
              valor={<Valor valor={projecao.margemPiorDia / 100} />}
              detalhe={projecao.margemPiorDia < 0 ? "abaixo da reserva no pior dia" : "no pior dia"}
            />
            <KpiCard
              variante="indicador"
              label="Déficit projetado"
              valor={projecao.primeiroDiaNegativo ? <Valor valor={projecao.menorSaldo.valor / 100} /> : "Nenhum"}
              detalhe={projecao.primeiroDiaNegativo ? `a partir de ${diaMes(projecao.primeiroDiaNegativo)}` : "o caixa não fica negativo"}
            />
            <KpiCard
              variante="indicador"
              label="Para não romper a reserva"
              valor={necessidade.primeiro ? `${brlC(necessidade.primeiro.valor)}` : brlC(0)}
              detalhe={
                !necessidade.primeiro
                  ? "a reserva se mantém"
                  : necessidade.total && necessidade.total.valor > necessidade.primeiro.valor
                    ? `até ${diaMes(necessidade.primeiro.dia)}; ${brlC(necessidade.total.valor)} no total até ${diaMes(necessidade.total.dia)}`
                    : `a receber a mais até ${diaMes(necessidade.primeiro.dia)}`
              }
            />
          </section>

          {alerta && (
            <section
              role="status"
              className={
                alerta.tipo === "deficit"
                  ? "flex gap-3 rounded-sm border border-destructive/50 bg-destructive/5 p-4"
                  : "flex gap-3 rounded-sm border border-warning/50 bg-warning/5 p-4"
              }
            >
              <AlertTriangle className={alerta.tipo === "deficit" ? "mt-0.5 size-5 shrink-0 text-destructive" : "mt-0.5 size-5 shrink-0 text-warning"} aria-hidden />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p>
                  <b>{alerta.tipo === "deficit" ? "Déficit projetado." : "Abaixo da reserva mínima."}</b>{" "}
                  {alerta.tipo === "deficit"
                    ? `Em ${rotuloDia(alerta.data)} o caixa fica negativo; o pior ponto é ${brlC(projecao.menorSaldo.valor)} em ${diaMes(projecao.menorSaldo.dia)}.`
                    : `Em ${rotuloDia(alerta.data)} o caixa fica ${brlC(alerta.falta)} abaixo da reserva de ${brlC(base.reservaMinima)}.`}
                </p>
                <div className="grid gap-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <p className="font-semibold">Maiores saídas até {diaMes(alerta.data)}</p>
                    {alerta.maioresSaidas.map((s) => (
                      <p key={s.id} className="flex justify-between gap-2"><span className="truncate">{s.descricao}</span><span className="font-mono">{brlC(s.valor)}</span></p>
                    ))}
                  </div>
                  <div>
                    <p className="font-semibold">Entradas até {diaMes(alerta.data)}</p>
                    {(Object.keys(alerta.entradasPorConfianca) as Confianca[])
                      .filter((c) => alerta.entradasPorConfianca[c] > 0 || c === "confirmada_cliente" || c === "provavel")
                      .map((c) => (
                        <p key={c} className="flex justify-between gap-2"><span>{ROTULOS_CONFIANCA[c]}</span><span className="font-mono">{brlC(alerta.entradasPorConfianca[c])}</span></p>
                      ))}
                  </div>
                  <div>
                    <p className="font-semibold">P3 e P4 que podem mudar de data</p>
                    <p className="font-mono text-base">{brlC(alerta.reprogramavelP3P4)}</p>
                    <p className="text-muted-foreground">vencendo até {diaMes(alerta.data)}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[15px]">Linha do tempo do caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <LinhaDoTempo projecao={projecao} antes={antes} eventos={eventos} caixaAtual={base.caixaAtual} reservaMinima={base.reservaMinima} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-1">
              <CardTitle className="text-[15px]">Agenda do horizonte</CardTitle>
              <span className="text-[13px] text-muted-foreground">Clique num movimento para ver o impacto. Botão direito ou ⋯ para mais ações.</span>
            </CardHeader>
            <CardContent>
              <DicaMenuContexto />
              <Agenda grupos={grupos} onSelect={(e, item) => void aoSelecionar(e, item)} onAbrir={(e) => setSelecionado({ id: e.id, focarData: false })} alemDoHorizonte={alemDoHorizonte} />
            </CardContent>
          </Card>
        </div>

        <PainelImpacto
          className="xl:sticky xl:top-28"
          projecao={projecao}
          antes={antes}
          reservaMinima={base.reservaMinima}
          ajustes={itensAjuste}
          semAlvo={semAlvo.length}
          onDescartar={() => void descartar()}
          onSalvar={podeSalvar ? () => setSalvarAberto(true) : undefined}
          onAplicar={podeGerir ? () => setAplicarAberto(true) : undefined}
          nota={
            cenario
              ? "As mudanças valem nesta tela até você salvar o cenário. O financeiro só muda ao aplicar."
              : "A simulação fica guardada nesta aba do navegador e não muda o financeiro até você aplicar."
          }
        />
      </div>

      <PainelEvento
        evento={evSel}
        projetado={evSel ? (projetadoPorId.get(evSel.id) ?? null) : null}
        noCenario={evSel ? eventoNoCenario(evSel, eixos) : false}
        hoje={base.hoje}
        fim={fim}
        menorSaldoAtual={projecao.menorSaldo.valor}
        previaDoMenorSaldo={(data: DataIso) => {
          if (!evSel) return null;
          const prox = registrarAjuste(ajustes, { tipo: "REPROGRAMAR_DATA", eventoId: evSel.id, data }, baseOriginalPorId.get(evSel.id));
          return projetar(entradaMotor(aplicarSimulacao(base.eventos, prox, base.hoje))).menorSaldo.valor;
        }}
        focarData={selecionado?.focarData ?? false}
        onFechar={() => setSelecionado(null)}
        onSimularData={(data) => {
          if (!evSel) return;
          if (evSel.origem === "simulado") {
            const id = evSel.id.slice(PREFIXO_SIMULADO.length);
            setAjustes((a) => a.map((x) => (x.tipo === "INCLUIR" && x.id === id ? { ...x, movimento: { ...x.movimento, data } } : x)));
          } else registrar({ tipo: "REPROGRAMAR_DATA", eventoId: evSel.id, data });
          toast.success(`Simulado para ${diaMes(data)}. Veja o antes e depois no painel de impacto.`);
          setSelecionado(null);
        }}
        onAlternar={() => {
          if (evSel) alternar(evSel);
          setSelecionado(null);
        }}
        onPrioridade={(p) => evSel && registrar({ tipo: "ALTERAR_PRIORIDADE", eventoId: evSel.id, prioridade: p })}
        onConfianca={(c) => evSel && registrar({ tipo: "ALTERAR_CONFIANCA", eventoId: evSel.id, confianca: c })}
      />

      <SimularMovimento
        aberto={novoAberto}
        hoje={base.hoje}
        fim={fim}
        reservaMinima={base.reservaMinima}
        categorias={categorias}
        previa={(m: MovimentoSimulado) => {
          const id = "previa";
          const comMov = projetar(entradaMotor(aplicarSimulacao(base.eventos, [...ajustes, { tipo: "INCLUIR", id, movimento: m }], base.hoje)));
          const dia = (p: typeof projecao, d: DataIso): Centavos => p.serie.find((s) => s.dia === d)?.saldo ?? p.hoje.caixa;
          return { saldoDiaAntes: dia(projecao, m.data), saldoDiaDepois: dia(comMov, m.data), menorSaldo: comMov.menorSaldo.valor, diaMenor: comMov.menorSaldo.dia };
        }}
        onFechar={() => setNovoAberto(false)}
        onIncluir={(m) => {
          const id = novoIdAjuste();
          setAjustes((a) => [...a, { tipo: "INCLUIR", id, movimento: m }]);
          setNovoAberto(false);
          toast.success("Movimento incluído na simulação.");
        }}
      />

      {podeGerir && <ReservaMinimaDialog aberto={reservaAberta} config={config} onFechar={() => setReservaAberta(false)} />}

      {podeSalvar && (
        <SalvarCenarioDialog
          aberto={salvarAberto}
          onFechar={() => setSalvarAberto(false)}
          cenario={
            cenario
              ? { id: cenario.id, nome: cenario.nome, descricao: cenario.descricao, editavel: cenarioEditavel && cenario.situacao !== "arquivado" }
              : null
          }
          nomeSugerido={nomePadraoDoCenario(base.hoje, ajustes.length)}
          premissas={premissas}
          ajustes={ajustes}
          onSalvo={(r) => {
            setSalvarAberto(false);
            if (r.novo || r.id !== cenario?.id) {
              // O rascunho virou cenário: a aba deixa de carregar o mesmo rascunho de novo.
              if (!cenario) {
                try {
                  window.sessionStorage.removeItem(CHAVE_RASCUNHO);
                } catch {
                  /* sem armazenamento: nada a limpar */
                }
              }
              router.push(`/financeiro/planejador?cenario=${encodeURIComponent(r.id)}&horizonte=${base.horizonteDias}`);
            } else {
              setSalvo(escreverRascunho({ eixos, ajustes }));
              router.refresh();
            }
          }}
        />
      )}

      {podeGerir && (
        <AplicarDialog
          aberto={aplicarAberto}
          onFechar={() => setAplicarAberto(false)}
          ajustes={ajustes}
          cenarioId={cenario?.id ?? null}
          onAtualizarAjustes={setAjustes}
          onAplicado={(indices) => {
            const ficam = ajustes.filter((_, i) => !indices.includes(i));
            setAjustes(ficam);
            // Com cenário, o servidor já gravou os que ficaram (na mesma transação).
            if (cenario) setSalvo(escreverRascunho({ eixos, ajustes: ficam }));
            setAplicarAberto(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
