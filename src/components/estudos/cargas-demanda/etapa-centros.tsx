"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Info, Plus, TriangleAlert } from "lucide-react";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACAO_CMD_DESCER,
  ACAO_CMD_DUPLICAR,
  ACAO_CMD_EXCLUIR,
  ACAO_CMD_SUBIR,
  ACAO_MEDIDOR_DESCER,
  ACAO_MEDIDOR_DUPLICAR,
  ACAO_MEDIDOR_EXCLUIR,
  ACAO_MEDIDOR_SUBIR,
  itensDeCmd,
  itensDeMedidor,
} from "@/modules/estudos/cargas-demanda/acoes-centros";
import { MAX_CMDS, MAX_MEDIDORES_POR_CMD, UFS, type CmdEstudo, type ConteudoCargasDemanda } from "@/modules/estudos/cargas-demanda/conteudo";
import { mover } from "@/modules/estudos/cargas-demanda/edicao";
import {
  MOTIVO_CMDS_CHEIO,
  MOTIVO_MEDIDORES_CHEIO,
  apartamentosDistribuidos,
  copiarCmd,
  entradaEfetiva,
  mapCmd,
  novoCmd,
  novoMedidor,
  removerCmd,
  type Medidor,
} from "@/modules/estudos/cargas-demanda/edicao-centros";
import { calcularEntrada } from "@/modules/estudos/cargas-demanda/entrada-estudo";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { calcularPredio } from "@/modules/estudos/cargas-demanda/resultado";
import type { ResultadoCmd, ResultadoNivel } from "@/modules/ferramentas/calc/cargas-demanda/niveis";

import { CampoNumero, LegendaDasCores, Rotulo } from "./campos";
import { BlocoDeFatores } from "./fatores";
import { FormEntrada } from "./form-entrada";
import type { Atualizar, PropsEtapa } from "./tipos";

const SEM = "__sem__";

/** id do tipo de apartamento → nome, para os rótulos dos fatores. */
const nomesDosTipos = (c: ConteudoCargasDemanda): Record<string, string> =>
  Object.fromEntries(c.calculos.filter((k) => k.metodo === "area_util").flatMap((k) => k.apartamentos.map((t, i) => [t.id, t.nome.trim() || `Tipo ${i + 1}`])));
const fmt = (v: number | null | undefined, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));
const ROTULO_MEDIDOR = { residencial: "Residencial", condominio: "Condomínio", incendio: "Incêndio", outro: "Outros" } as const;
const USOS = { residencial: "Residencial", comercial: "Comercial", misto: "Misto" } as const;

/** Etapa 3 — centros de medição (CMD), entrada geral (CPG), entradas, responsável técnico e relatório. */
export function EtapaCentros({ conteudo, atualizar, podeEditar }: PropsEtapa) {
  const { predio, resumo } = useMemo(() => calcularPredio(conteudo), [conteudo]);
  const dist = apartamentosDistribuidos(conteudo);
  const cmds = conteudo.centros.cmds;
  const novo = () => atualizar((c) => ({ ...c, centros: { ...c.centros, cmds: [...c.centros.cmds, novoCmd(`CMD ${c.centros.cmds.length + 1}`)] } }));

  // Avisos do lado: os do conjunto de CMDs, o de cada CMD e o nível de tensão esperado pelo CPG.
  const avisos: { chave: string; tom: "info" | "ok" | "alerta"; texto: string }[] = [];
  if (predio) {
    predio.cpg.atendimento.mensagens.forEach((m, i) => avisos.push({ chave: `at-${i}`, tom: "info", texto: m.texto }));
    if (cmds.length > 0 && predio.avisos.length === 0 && dist.noPredio > 0) avisos.push({ chave: "dist", tom: "ok", texto: `Distribuição: ${dist.nosCmds} de ${dist.noPredio} apartamentos nos CMDs.` });
    predio.avisos.forEach((m, i) => avisos.push({ chave: `pr-${i}`, tom: "alerta", texto: m.texto }));
    predio.cmds.forEach((c) => c.avisosDoCmd.forEach((m, i) => avisos.push({ chave: `cmd-${c.id}-${i}`, tom: "alerta", texto: `${c.nome}: ${m.texto}` })));
  }
  resumo.avisos.forEach((m, i) => avisos.push({ chave: `rs-${i}`, tom: "alerta", texto: m.texto }));

  const cpgEntrada = useMemo(
    () => calcularEntrada(entradaEfetiva(conteudo, { nivel: "cpg" }), predio?.cpg.demandaKVA ?? null, conteudo.sistema, conteudo.ligacao),
    [conteudo, predio],
  );

  return (
    <section aria-label="Centros e entradas" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-bold">Centros de medição e entrada geral</h2>
        {podeEditar && (
          <Button type="button" variant="outline" size="sm" disabled={cmds.length >= MAX_CMDS} title={cmds.length >= MAX_CMDS ? MOTIVO_CMDS_CHEIO : undefined} onClick={novo}>
            <Plus aria-hidden className="mr-1 size-3.5" /> CMD
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Cada CMD pode ter só flats, ou também medidor de condomínio e de incêndio. Também dá para criar CMDs separados só para condomínio e só para incêndio.</p>
      <LegendaDasCores />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <OpcoesDoEstudo conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} />

          {cmds.length === 0 && (
            <EmptyState icon={Info} title="Nenhum CMD ainda" description="Crie um CMD e distribua nele os apartamentos e os medidores de condomínio e de incêndio." action={podeEditar ? <Button type="button" size="sm" onClick={novo}><Plus aria-hidden className="mr-1 size-4" /> CMD</Button> : undefined} />
          )}
          {cmds.map((m, i) => (
            <CmdCard key={m.id} conteudo={conteudo} cmd={m} indice={i} total={cmds.length} resultado={predio?.cmds.find((x) => x.id === m.id)} atualizar={atualizar} podeEditar={podeEditar} />
          ))}

          {predio && cmds.length > 0 && <CpgCard conteudo={conteudo} cpg={predio.cpg} somaDosCmds={predio.cmds.reduce((s, c) => s + (c.demandaKVA ?? 0), 0)} atualizar={atualizar} podeEditar={podeEditar} dist={dist} />}

          <ResponsavelTecnico conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} />

          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-bold">Relatório</h3>
            <p className="mb-2 text-sm text-muted-foreground">Traz fórmulas, tabelas, a fonte de cada valor e o responsável técnico.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled title="O relatório entra na próxima fase.">Baixar Excel</Button>
              <Button type="button" size="sm" disabled title="O relatório entra na próxima fase.">Baixar Word</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">O relatório ainda não está disponível neste estudo.</p>
          </div>
        </div>

        <aside className="min-w-0 space-y-3" aria-label="Resumo e avisos">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold">Resumo da entrada</h3>
            <dl className="space-y-1 text-sm">
              <Linha rotulo="Demanda do CPG" valor={predio ? `${fmt(predio.cpg.demandaKVA)} kVA` : "—"} />
              <Linha rotulo="Corrente" valor={`${fmt(cpgEntrada.correnteA)} A`} />
              <Linha rotulo="Disjuntor" valor={`${fmt(cpgEntrada.disjuntorAdotadoA, 0)} A`} />
              <Linha rotulo="Seção do cabo" valor={`${fmt(cpgEntrada.secaoFinal?.adotadaMm2, 0)} mm²`} />
            </dl>
          </div>
          <div className="space-y-2 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-bold">Avisos</h3>
            {avisos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aviso.</p>}
            {avisos.map((a) => (
              <p
                key={a.chave}
                className={
                  a.tom === "info"
                    ? "flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
                    : a.tom === "ok"
                      ? "flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-text"
                      : "flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-sm text-warning-text"
                }
              >
                {a.tom === "alerta" ? <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
                {a.texto}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <dt>{rotulo}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{valor}</dd>
    </div>
  );
}

/** Uso da edificação e as opções que mudam o método de algumas concessionárias. */
function OpcoesDoEstudo({ conteudo, atualizar, podeEditar }: PropsEtapa) {
  const c = conteudo.concessionaria;
  const setC = (f: (x: ConteudoCargasDemanda["centros"]) => ConteudoCargasDemanda["centros"]) => atualizar((x) => ({ ...x, centros: f(x.centros) }));
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card px-4 py-3">
      <div className="flex w-48 flex-col gap-1">
        <Rotulo>Uso da edificação</Rotulo>
        <Select value={conteudo.centros.uso ?? SEM} disabled={!podeEditar} onValueChange={(v) => setC((x) => ({ ...x, uso: v && v !== SEM ? (v as keyof typeof USOS) : null }))}>
          <SelectTrigger className="w-full" aria-label="Uso da edificação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM}>Pelos cálculos</SelectItem>
            {(Object.keys(USOS) as (keyof typeof USOS)[]).map((k) => (
              <SelectItem key={k} value={k}>
                {USOS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {c === "neoenergia" && (
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={!!conteudo.centros.opcoes.studio} disabled={!podeEditar} onChange={(e) => setC((x) => ({ ...x, opcoes: { ...x.opcoes, studio: e.target.checked } }))} />
          Apartamentos tipo studio
        </label>
      )}
      {c === "equatorial" && (
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={!!conteudo.centros.opcoes.apartHotel} disabled={!podeEditar} onChange={(e) => setC((x) => ({ ...x, opcoes: { ...x.opcoes, apartHotel: e.target.checked } }))} />
          Apart-hotel (apartamentos por carga instalada)
        </label>
      )}
      {c === "cemig" && (
        <div className="flex w-64 flex-col gap-1">
          <Rotulo>Apartamentos de áreas diferentes</Rotulo>
          <Select value={conteudo.centros.opcoes.formaCemig ?? SEM} disabled={!podeEditar} onValueChange={(v) => setC((x) => ({ ...x, opcoes: { ...x.opcoes, formaCemig: v === "conjunto" || v === "media" ? v : undefined } }))}>
            <SelectTrigger className="w-full" aria-label="Forma de cálculo com áreas diferentes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Padrão da concessionária</SelectItem>
              <SelectItem value="conjunto">Por conjunto de mesma área</SelectItem>
              <SelectItem value="media">Pela média ponderada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function CmdCard({
  conteudo,
  cmd,
  indice,
  total,
  resultado,
  atualizar,
  podeEditar,
}: {
  conteudo: ConteudoCargasDemanda;
  cmd: CmdEstudo;
  indice: number;
  total: number;
  resultado: ResultadoCmd | undefined;
  atualizar: Atualizar;
  podeEditar: boolean;
}) {
  const confirm = useConfirm();
  const [aberto, setAberto] = useState(true);
  const setM = (f: (m: CmdEstudo) => CmdEstudo) => atualizar((c) => mapCmd(c, cmd.id, f));
  const temEntrada = conteudo.entradas.some((e) => e.alvo.nivel === "cmd" && e.alvo.cmdId === cmd.id);
  const itens = podeEditar ? itensDeCmd({ indice, total, nome: cmd.nome, temEntrada }) : [];
  const tipos = conteudo.calculos.filter((k) => k.metodo === "area_util").flatMap((k) => k.apartamentos.map((t) => ({ id: t.id, nome: t.nome || "Tipo sem nome" })));
  const calculos = conteudo.calculos.filter((k) => k.metodo === "carga_instalada");
  const medidores = resultado?.medidores ?? 0;

  async function confirmar(item: AcaoItemAcao) {
    if (!item.confirmar) return true;
    return confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" });
  }

  async function acaoCmd(item: AcaoItemAcao) {
    if (!(await confirmar(item))) return;
    atualizar((c) => {
      const i = c.centros.cmds.findIndex((m) => m.id === cmd.id);
      if (i < 0) return c;
      const cmds = c.centros.cmds;
      if (item.id === ACAO_CMD_DUPLICAR) return { ...c, centros: { ...c.centros, cmds: [...cmds.slice(0, i + 1), copiarCmd(cmds[i]), ...cmds.slice(i + 1)] } };
      if (item.id === ACAO_CMD_SUBIR) return { ...c, centros: { ...c.centros, cmds: mover(cmds, i, i - 1) } };
      if (item.id === ACAO_CMD_DESCER) return { ...c, centros: { ...c.centros, cmds: mover(cmds, i, i + 1) } };
      if (item.id === ACAO_CMD_EXCLUIR) return removerCmd(c, cmd.id);
      return c;
    });
  }

  async function acaoMedidor(indiceMedidor: number, item: AcaoItemAcao) {
    if (!(await confirmar(item))) return;
    setM((m) => {
      const l = m.medidores;
      if (item.id === ACAO_MEDIDOR_DUPLICAR) return { ...m, medidores: [...l.slice(0, indiceMedidor + 1), { ...l[indiceMedidor] }, ...l.slice(indiceMedidor + 1)] };
      if (item.id === ACAO_MEDIDOR_SUBIR) return { ...m, medidores: mover(l, indiceMedidor, indiceMedidor - 1) };
      if (item.id === ACAO_MEDIDOR_DESCER) return { ...m, medidores: mover(l, indiceMedidor, indiceMedidor + 1) };
      if (item.id === ACAO_MEDIDOR_EXCLUIR) return { ...m, medidores: l.filter((_, k) => k !== indiceMedidor) };
      return m;
    });
  }

  function adicionarMedidor() {
    const medidor: Medidor | null = tipos[0] ? novoMedidor("residencial", tipos[0].id) : calculos[0] ? novoMedidor("condominio", calculos[0].id) : null;
    if (medidor) setM((m) => ({ ...m, medidores: [...m.medidores, medidor] }));
  }

  function trocarTipo(i: number, tipo: Medidor["tipo"]) {
    const ref = tipo === "residencial" ? tipos[0]?.id : calculos[0]?.id;
    if (!ref) return;
    setM((m) => ({ ...m, medidores: m.medidores.map((x, k) => (k === i ? novoMedidor(tipo, ref) : x)) }));
  }

  function ajustar(grupo: "apartamentos" | "duplex", chave: string, valor: number | null) {
    setM((m) => {
      const atual = { ...(m.ajustes[grupo] ?? {}) };
      if (valor == null || !(valor > 0)) delete atual[chave];
      else atual[chave] = valor;
      return { ...m, ajustes: { ...m.ajustes, [grupo]: atual } };
    });
  }

  const demandaDe = (m: Medidor): number | null => (m.tipo === "residencial" ? null : (resultado?.parcelas.flatMap((p) => (p.calculos.includes(m.calculoId) ? [p.valor] : []))[0] ?? null));
  const unicoResidencial = cmd.medidores.filter((m) => m.tipo === "residencial").length === 1;

  return (
    <section aria-label={cmd.nome} className="rounded-lg border bg-card">
      <LinhaComMenu itens={itens} onSelect={(i) => void acaoCmd(i)} render={<header className="flex flex-wrap items-center gap-2 border-b px-4 py-3" />}>
        <Input aria-label="Nome do CMD" value={cmd.nome} maxLength={80} disabled={!podeEditar} onChange={(e) => setM((m) => ({ ...m, nome: e.target.value }))} className="h-8 max-w-48 border-transparent bg-transparent font-semibold hover:border-input" />
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{cmd.capacidade != null ? `${medidores} de ${cmd.capacidade} medidores` : `${medidores} medidores`}</span>
        <span className="ml-auto text-base font-bold tabular-nums">{fmt(resultado?.demandaKVA)} kVA</span>
        <Button type="button" variant="ghost" size="sm" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          {aberto ? <ChevronUp aria-hidden className="mr-1 size-4" /> : <ChevronDown aria-hidden className="mr-1 size-4" />}
          {aberto ? "Fechar" : "Abrir CMD"}
        </Button>
        <BotaoAcoes itens={itens} onSelect={(i) => void acaoCmd(i)} rotulo={`Ações do ${cmd.nome}`} className="size-8" />
      </LinhaComMenu>

      {aberto && (
        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-52 flex-col gap-1">
              <Rotulo>Capacidade do CMD (medidores)</Rotulo>
              <CampoNumero rotulo={`Capacidade de ${cmd.nome}`} valor={cmd.capacidade} casas={0} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => setM((m) => ({ ...m, capacidade: v == null || v <= 0 ? null : Math.round(v) }))} />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">Adicione ou remova os medidores deste CMD: residencial, condomínio, incêndio ou outros.</p>
          </div>

          {cmd.medidores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">Medidores de {cmd.nome}</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-6" aria-label="Reordenar" />
                    <th className="px-1 pb-1 font-medium">Tipo de medidor</th>
                    <th className="px-1 pb-1 font-medium">Descrição</th>
                    <th className="px-1 pb-1 font-medium">Quantidade</th>
                    <th className="px-1 pb-1 font-medium">Demanda (kVA)</th>
                    <th className="w-10" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {cmd.medidores.map((m, i) => {
                    const it = podeEditar ? itensDeMedidor({ indice: i, total: cmd.medidores.length }) : [];
                    const dem = m.tipo === "residencial" && unicoResidencial ? (resultado?.apartamentos?.demandaKVA ?? null) : demandaDe(m);
                    return (
                      <LinhaComMenu key={i} itens={it} onSelect={(item) => void acaoMedidor(i, item)} render={<tr className="border-t align-top" />}>
                        <td className="px-1 py-1.5">
                          <GripVertical aria-hidden className="size-4 text-muted-foreground/40" />
                        </td>
                        <td className="px-1 py-1.5">
                          <Select value={m.tipo} disabled={!podeEditar} onValueChange={(v) => v && trocarTipo(i, v as Medidor["tipo"])}>
                            <SelectTrigger className="w-40" aria-label={`Tipo do medidor ${i + 1} de ${cmd.nome}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROTULO_MEDIDOR) as (keyof typeof ROTULO_MEDIDOR)[]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {ROTULO_MEDIDOR[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1.5">
                          <Select
                            value={m.tipo === "residencial" ? m.tipoApartamentoId : m.calculoId}
                            disabled={!podeEditar}
                            onValueChange={(v) => v && setM((x) => ({ ...x, medidores: x.medidores.map((y, k) => (k === i ? (y.tipo === "residencial" ? { ...y, tipoApartamentoId: v } : { ...y, calculoId: v }) : y)) }))}
                          >
                            <SelectTrigger className="w-full min-w-48" aria-label={`Descrição do medidor ${i + 1} de ${cmd.nome}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(m.tipo === "residencial" ? tipos : calculos.map((k) => ({ id: k.id, nome: k.nome }))).map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1.5">
                          {m.tipo === "residencial" ? (
                            <CampoNumero rotulo={`Quantidade do medidor ${i + 1} de ${cmd.nome}`} valor={m.quantidade} casas={0} desabilitado={!podeEditar} onChange={(v) => setM((x) => ({ ...x, medidores: x.medidores.map((y, k) => (k === i && y.tipo === "residencial" ? { ...y, quantidade: v == null ? 0 : Math.max(0, Math.round(v)) } : y)) }))} className="min-w-20" />
                          ) : (
                            <span className="block text-center text-muted-foreground">1</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5">
                          <CampoNumero rotulo={`Demanda do medidor ${i + 1} de ${cmd.nome} (kVA)`} valor={dem} tom="calculado" somenteLeitura className="min-w-24" />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <BotaoAcoes itens={it} onSelect={(item) => void acaoMedidor(i, item)} rotulo={`Ações do medidor ${i + 1}`} className="size-7" />
                        </td>
                      </LinhaComMenu>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {podeEditar && (
            <Button type="button" variant="ghost" size="sm" disabled={cmd.medidores.length >= MAX_MEDIDORES_POR_CMD || (tipos.length === 0 && calculos.length === 0)} title={cmd.medidores.length >= MAX_MEDIDORES_POR_CMD ? MOTIVO_MEDIDORES_CHEIO : tipos.length === 0 && calculos.length === 0 ? "Crie antes um cálculo na etapa Demandas." : undefined} onClick={adicionarMedidor}>
              <Plus aria-hidden className="mr-1 size-3.5" /> Medidor
            </Button>
          )}

          {resultado?.apartamentos && <BlocoDeFatores concessionaria={conteudo.concessionaria ?? ""} titulo={`Fatores dos apartamentos, para ${cmd.medidores.reduce((s, m) => s + (m.tipo === "residencial" ? m.quantidade : 0), 0)} apartamentos`} r={resultado.apartamentos} grupo="apartamentos" podeEditar={podeEditar} onAjustar={ajustar} nomes={nomesDosTipos(conteudo)} />}
          {resultado?.duplex && <BlocoDeFatores concessionaria={conteudo.concessionaria ?? ""} titulo="Duplex" r={resultado.duplex} grupo="duplex" podeEditar={podeEditar} onAjustar={ajustar} nomes={nomesDosTipos(conteudo)} />}

          <p className="text-right text-sm font-semibold tabular-nums">
            Medidores: {medidores}
            {cmd.capacidade != null ? ` de ${cmd.capacidade}` : ""} · Demanda do CMD: {fmt(resultado?.demandaKVA)} kVA
          </p>

          <div className="border-t pt-3">
            <FormEntrada conteudo={conteudo} alvo={{ nivel: "cmd", cmdId: cmd.id }} demandaKVA={resultado?.demandaKVA ?? null} atualizar={atualizar} podeEditar={podeEditar} condicoesAbertas={false} tituloCondicoes={`Condições de instalação do ${cmd.nome}`} />
          </div>
        </div>
      )}
    </section>
  );
}

function CpgCard({
  conteudo,
  cpg,
  somaDosCmds,
  atualizar,
  podeEditar,
  dist,
}: {
  conteudo: ConteudoCargasDemanda;
  cpg: ResultadoNivel;
  somaDosCmds: number;
  atualizar: Atualizar;
  podeEditar: boolean;
  dist: { nosCmds: number; noPredio: number };
}) {
  const ajustar = (grupo: "apartamentos" | "duplex", chave: string, valor: number | null) =>
    atualizar((c) => {
      const atual = { ...(c.centros.ajustesCpg[grupo] ?? {}) };
      if (valor == null || !(valor > 0)) delete atual[chave];
      else atual[chave] = valor;
      return { ...c, centros: { ...c.centros, ajustesCpg: { ...c.centros.ajustesCpg, [grupo]: atual } } };
    });
  const distribuidos = dist.nosCmds === dist.noPredio;
  return (
    <section aria-label="CPG" className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-semibold">CPG</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Soma de tudo</span>
        <span className={distribuidos ? "rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success-text" : "rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning-text"}>
          {dist.nosCmds} de {dist.noPredio} apartamentos distribuídos nos CMDs
        </span>
        <span className="ml-auto text-base font-bold tabular-nums">{fmt(cpg.demandaKVA)} kVA</span>
      </header>
      <div className="space-y-3 px-4 py-3">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <caption className="sr-only">Composição do CPG</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-1 pb-1 text-left font-medium">Item</th>
              <th className="px-1 pb-1 font-medium">Quantidade</th>
              <th className="px-1 pb-1 font-medium">Demanda (kVA)</th>
            </tr>
          </thead>
          <tbody>
            {cpg.apartamentos && (
              <tr className="border-t">
                <td className="px-1 py-1.5">Apartamentos de todos os CMDs (área útil)</td>
                <td className="px-1 py-1.5 text-center tabular-nums">{dist.noPredio}</td>
                <td className="px-1 py-1.5 text-center tabular-nums">{fmt(cpg.apartamentos.demandaKVA)}</td>
              </tr>
            )}
            {cpg.parcelas
              .filter((p) => p.calculos.length > 0 || p.valor !== 0)
              .map((p) => (
                <tr key={p.chave} className="border-t">
                  <td className="px-1 py-1.5">{p.rotulo}</td>
                  <td className="px-1 py-1.5 text-center tabular-nums">{p.calculos.length}</td>
                  <td className="px-1 py-1.5 text-center tabular-nums">
                    {fmt(p.valor)} {p.unidade === "kW" ? "kW" : ""}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {cpg.apartamentos && <BlocoDeFatores concessionaria={conteudo.concessionaria ?? ""} titulo={`Fatores dos apartamentos, para ${dist.noPredio} apartamentos`} r={cpg.apartamentos} grupo="apartamentos" podeEditar={podeEditar} onAjustar={ajustar} nomes={nomesDosTipos(conteudo)} />}
        {cpg.duplex && <BlocoDeFatores concessionaria={conteudo.concessionaria ?? ""} titulo="Duplex" r={cpg.duplex} grupo="duplex" podeEditar={podeEditar} onAjustar={ajustar} nomes={nomesDosTipos(conteudo)} />}
        <p className="text-xs text-muted-foreground">
          O CPG usa o total de apartamentos do prédio ({dist.noPredio}), e não a soma das demandas dos CMDs ({fmt(somaDosCmds)} kVA).
        </p>
        <p className="text-right text-sm font-semibold tabular-nums">Demanda do CPG: {fmt(cpg.demandaKVA)} kVA</p>
        <div className="border-t pt-3">
          <h4 className="mb-2 text-sm font-semibold">Entrada do CPG</h4>
          <FormEntrada conteudo={conteudo} alvo={{ nivel: "cpg" }} demandaKVA={cpg.demandaKVA} atualizar={atualizar} podeEditar={podeEditar} condicoesAbertas />
          <p className="mt-2 text-xs text-muted-foreground">Os valores em azul são sugeridos pela corrente calculada. Digite o disjuntor e o cabo que você vai adotar. Estas condições de instalação valem também para os CMDs; altere por circuito se precisar.</p>
        </div>
      </div>
    </section>
  );
}

function ResponsavelTecnico({ conteudo, atualizar, podeEditar }: PropsEtapa) {
  const r = conteudo.responsavel;
  const set = (f: (x: typeof r) => typeof r) => atualizar((c) => ({ ...c, responsavel: f(c.responsavel) }));
  return (
    <section aria-label="Responsável técnico" className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-bold">Responsável técnico</h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_6rem]">
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor="cd-resp-nome">Nome do engenheiro</Rotulo>
          <Input id="cd-resp-nome" value={r.nome} maxLength={120} placeholder="digite" disabled={!podeEditar} onChange={(e) => set((x) => ({ ...x, nome: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor="cd-resp-crea">CREA (número)</Rotulo>
          <Input id="cd-resp-crea" value={r.crea} maxLength={20} placeholder="digite" disabled={!podeEditar} onChange={(e) => set((x) => ({ ...x, crea: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Rotulo>UF</Rotulo>
          <Select value={r.uf ?? SEM} disabled={!podeEditar} onValueChange={(v) => set((x) => ({ ...x, uf: v && v !== SEM ? (v as (typeof UFS)[number]) : null }))}>
            <SelectTrigger className="w-full" aria-label="UF do CREA">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>—</SelectItem>
              {UFS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={r.declaracaoConferencia}
          disabled={!podeEditar}
          onChange={(e) => set((x) => ({ ...x, declaracaoConferencia: e.target.checked, conferidoEm: e.target.checked ? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : null }))}
        />
        Conferi os dados e os valores sugeridos e assumo a responsabilidade por este estudo.
      </label>
      {(!r.declaracaoConferencia || r.crea.trim() === "") && <p className="mt-2 text-xs text-muted-foreground">Sem a declaração ou sem o CREA, o relatório sai marcado como “Dados não conferidos por responsável técnico”.</p>}
    </section>
  );
}

