"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACAO_CALC_DESCER,
  ACAO_CALC_DUPLICAR,
  ACAO_CALC_EXCLUIR,
  ACAO_CALC_SUBIR,
  ACAO_LINHA_ATUALIZAR,
  ACAO_LINHA_DESCARTAR_EDICAO,
  ACAO_LINHA_DESCER,
  ACAO_LINHA_DUPLICAR,
  ACAO_LINHA_EXCLUIR,
  ACAO_LINHA_SUBIR,
  itensDeCalculo,
  itensDeLinhaDeCarga,
} from "@/modules/estudos/cargas-demanda/acoes-calculo";
import {
  PAPEIS_CALCULO,
  TIPOS_CARGA,
  TIPO_CARGA_ROTULO,
  type CalculoEstudo,
  type ConteudoCargasDemanda,
  type LinhaCargaEstudo,
  type TipoCarga,
} from "@/modules/estudos/cargas-demanda/conteudo";
import {
  atualizarDoLevantamentoNoCalculo,
  copiarCalculo,
  linhasAdministracaoEdificios,
  mapCalculo,
  mapLinha,
  novaLinhaCarga,
  removerCalculo,
  trazerDoLevantamento,
} from "@/modules/estudos/cargas-demanda/edicao-calculo";
import { mover, novoId } from "@/modules/estudos/cargas-demanda/edicao";
import { GRUPOS_EQUIPAMENTO_EQUATORIAL, fdEfetivoDaLinha, regraCabeNoTipo, regraDaLinha, regrasOferecidas, REGRA_EQT_AQUECIMENTO } from "@/modules/estudos/cargas-demanda/fd-linha";
import { estadoDoVinculo, totaisDoEscopo } from "@/modules/estudos/cargas-demanda/levantamento";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { calcularCalculoDeCargaInstalada } from "@/modules/estudos/cargas-demanda/resultado";

import { CampoNumero, Rotulo } from "./campos";
import { EscolhaFdAquecimento } from "./escolha-fd-aquecimento";
import type { Atualizar } from "./tipos";

export const ROTULO_PAPEL: Record<(typeof PAPEIS_CALCULO)[number], string> = {
  condominio: "Condomínio",
  incendio: "Incêndio",
  especial: "Cargas especiais",
  comercial: "Cargas comerciais (lojas)",
  recarga: "Recarga de veículos elétricos",
  duplex: "Duplex (aquecimento e ar-condicionado)",
  apartamentos: "Apartamentos por carga instalada (apart-hotel)",
};

const SEM = "__sem__";
const fmt = (v: number | null, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));

export type PropsCalculo = {
  conteudo: ConteudoCargasDemanda;
  calculo: CalculoEstudo;
  indice: number;
  total: number;
  atualizar: Atualizar;
  podeEditar: boolean;
};

/** Medidores dos CMDs que citam o cálculo (a exclusão avisa antes). */
export function medidoresQueCitam(c: ConteudoCargasDemanda, calculoId: string): number {
  const tipos = new Set(c.calculos.find((k) => k.id === calculoId)?.apartamentos.map((t) => t.id) ?? []);
  return c.centros.cmds.flatMap((m) => m.medidores).filter((md) => (md.tipo === "residencial" ? tipos.has(md.tipoApartamentoId) : md.calculoId === calculoId)).length;
}

/** Ações do cálculo (menu do cabeçalho): duplicar, mover, excluir — compartilhado com o cartão de área útil. */
export function useAcoesDoCalculo({ conteudo, calculo, indice, total, atualizar, podeEditar }: PropsCalculo) {
  const confirm = useConfirm();
  const itens: AcaoItem[] = podeEditar ? itensDeCalculo({ indice, total, nome: calculo.nome, medidoresQueCitam: medidoresQueCitam(conteudo, calculo.id) }) : [];
  async function executar(item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" });
      if (!ok) return;
    }
    atualizar((c) => {
      const i = c.calculos.findIndex((k) => k.id === calculo.id);
      if (i < 0) return c;
      if (item.id === ACAO_CALC_DUPLICAR) return { ...c, calculos: [...c.calculos.slice(0, i + 1), copiarCalculo(c.calculos[i]), ...c.calculos.slice(i + 1)] };
      if (item.id === ACAO_CALC_SUBIR) return { ...c, calculos: mover(c.calculos, i, i - 1) };
      if (item.id === ACAO_CALC_DESCER) return { ...c, calculos: mover(c.calculos, i, i + 1) };
      if (item.id === ACAO_CALC_EXCLUIR) return removerCalculo(c, calculo.id);
      return c;
    });
  }
  return { itens, executar };
}

/** Cartão de cálculo por CARGA INSTALADA: escopo, linhas (do levantamento ou digitadas), carga em kW e kVA, FD e demanda. */
export function CardCargaInstalada(props: PropsCalculo) {
  const { conteudo, calculo: k, atualizar, podeEditar } = props;
  const confirm = useConfirm();
  const [aberto, setAberto] = useState(true);
  const { itens, executar } = useAcoesDoCalculo(props);
  const resultado = useMemo(() => calcularCalculoDeCargaInstalada(k, conteudo.concessionaria), [k, conteudo.concessionaria]);
  const totais = useMemo(() => totaisDoEscopo(conteudo, k.escopo.levantamentoIds), [conteudo, k.escopo.levantamentoIds]);
  const setK = (f: (x: CalculoEstudo) => CalculoEstudo) => atualizar((c) => mapCalculo(c, k.id, f));

  const faltantes = [...new Set(resultado.linhas.flatMap((l) => l.faltam))];
  const status = k.linhas.length === 0 ? "Sem linhas" : faltantes.length > 0 ? `Faltam ${faltantes.join(" e ")}` : null;
  const temAquecimentoEquatorial = conteudo.concessionaria === "equatorial" && k.linhas.some((l) => regraDaLinha(conteudo.concessionaria, l) === REGRA_EQT_AQUECIMENTO);

  function alternarLevantamento(id: string) {
    setK((x) => ({ ...x, escopo: { ...x.escopo, levantamentoIds: x.escopo.levantamentoIds.includes(id) ? x.escopo.levantamentoIds.filter((l) => l !== id) : [...x.escopo.levantamentoIds, id] } }));
  }

  function trazer() {
    const r = trazerDoLevantamento(conteudo, k);
    if (r.trazidas > 0) setK(() => r.calculo);
    if (r.trazidas > 0) toast.success(`${r.trazidas} linha(s) trazida(s) do levantamento.${r.incompletas ? ` ${r.incompletas} ficaram de fora: o levantamento tem FP, quantidade ou potência em branco.` : ""}`);
    else if (r.incompletas > 0) toast.error("O levantamento ainda tem FP, quantidade ou potência em branco: nada foi trazido.");
    else toast.message(r.jaTinha > 0 ? "O cálculo já tem todas as linhas do levantamento." : "O escopo não tem cargas para trazer.");
  }

  function atualizarVinculadas() {
    const r = atualizarDoLevantamentoNoCalculo(conteudo, k);
    if (r.atualizadas > 0) setK(() => r.calculo);
    toast[r.atualizadas > 0 ? "success" : "message"](
      r.atualizadas > 0 ? `${r.atualizadas} linha(s) atualizada(s).${r.editadas ? ` ${r.editadas} editada(s) à mão ficaram como estão.` : ""}` : r.editadas > 0 ? `Nada atualizado: ${r.editadas} linha(s) foram editadas à mão. Use "Descartar edição" na linha para refazê-la.` : "As linhas já estão iguais ao levantamento.",
    );
  }

  async function acaoLinha(linhaId: string, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" });
      if (!ok) return;
    }
    if (item.id === ACAO_LINHA_ATUALIZAR || item.id === ACAO_LINHA_DESCARTAR_EDICAO) {
      const r = atualizarDoLevantamentoNoCalculo(conteudo, k, { linhaId, descartarEdicao: item.id === ACAO_LINHA_DESCARTAR_EDICAO });
      if (r.atualizadas > 0) setK(() => r.calculo);
      return;
    }
    setK((x) => {
      const i = x.linhas.findIndex((l) => l.id === linhaId);
      if (i < 0) return x;
      if (item.id === ACAO_LINHA_DUPLICAR) return { ...x, linhas: [...x.linhas.slice(0, i + 1), { ...x.linhas[i], id: novoId("lin_"), vinculo: x.linhas[i].vinculo ? { ...x.linhas[i].vinculo!, origem: { ...x.linhas[i].vinculo!.origem } } : null }, ...x.linhas.slice(i + 1)] };
      if (item.id === ACAO_LINHA_SUBIR) return { ...x, linhas: mover(x.linhas, i, i - 1) };
      if (item.id === ACAO_LINHA_DESCER) return { ...x, linhas: mover(x.linhas, i, i + 1) };
      if (item.id === ACAO_LINHA_EXCLUIR) return { ...x, linhas: x.linhas.filter((l) => l.id !== linhaId) };
      return x;
    });
  }

  function soltar(destinoId: string, origemId: string) {
    if (destinoId === origemId) return;
    setK((x) => {
      const de = x.linhas.findIndex((l) => l.id === origemId);
      const para = x.linhas.findIndex((l) => l.id === destinoId);
      return de < 0 || para < 0 ? x : { ...x, linhas: mover(x.linhas, de, para) };
    });
  }

  return (
    <section aria-label={`Cálculo ${k.nome}`} className="rounded-lg border bg-card">
      <LinhaComMenu itens={itens} onSelect={(i) => void executar(i)} render={<header className="flex flex-wrap items-center gap-2 border-b px-4 py-3" />}>
        <Input aria-label="Nome do cálculo" value={k.nome} maxLength={120} disabled={!podeEditar} onChange={(e) => setK((x) => ({ ...x, nome: e.target.value }))} className="h-8 max-w-64 border-transparent bg-transparent font-semibold hover:border-input" />
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Carga instalada</span>
        <span className="ml-auto" />
        {status ? <span className="text-sm font-semibold text-warning-text">{status}</span> : <span className="text-base font-bold tabular-nums">{fmt(resultado.demandaKVA)} kVA</span>}
        <Button type="button" variant="ghost" size="sm" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          {aberto ? <ChevronUp aria-hidden className="mr-1 size-4" /> : <ChevronDown aria-hidden className="mr-1 size-4" />}
          {aberto ? "Fechar" : "Abrir cálculo"}
        </Button>
        <BotaoAcoes itens={itens} onSelect={(i) => void executar(i)} rotulo={`Ações do cálculo ${k.nome}`} className="size-8" />
      </LinhaComMenu>

      {aberto && (
        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-72 max-w-full flex-col gap-1">
              <Rotulo>Papel na demanda do empreendimento</Rotulo>
              <Select value={k.papel ?? SEM} disabled={!podeEditar} onValueChange={(v) => setK((x) => ({ ...x, papel: v && v !== SEM ? (v as (typeof PAPEIS_CALCULO)[number]) : null }))}>
                <SelectTrigger className="w-full" aria-label={`Papel do cálculo ${k.nome}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Unidade individual (não entra no prédio)</SelectItem>
                  {PAPEIS_CALCULO.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULO_PAPEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
              <Rotulo>Cargas dos levantamentos</Rotulo>
              <div className="flex flex-wrap items-center gap-1.5">
                {conteudo.levantamentos.length === 0 && <span className="text-sm text-muted-foreground">Nenhum levantamento: digite as cargas abaixo.</span>}
                {conteudo.levantamentos.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={k.escopo.levantamentoIds.includes(l.id)}
                    disabled={!podeEditar}
                    onClick={() => alternarLevantamento(l.id)}
                    className="rounded-md border px-2.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:font-semibold disabled:opacity-60"
                  >
                    {l.nome}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-24 flex-col gap-1">
              <Rotulo>Quantidade (× N)</Rotulo>
              <CampoNumero rotulo={`Quantidade do escopo do cálculo ${k.nome}`} valor={k.escopo.quantidade} casas={0} desabilitado={!podeEditar} onChange={(v) => setK((x) => ({ ...x, escopo: { ...x.escopo, quantidade: v == null ? 1 : Math.max(1, Math.round(v)) } }))} />
            </div>
          </div>

          {podeEditar && k.escopo.levantamentoIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={trazer}>
                <Plus aria-hidden className="mr-1 size-3.5" /> Trazer do levantamento
              </Button>
              {k.linhas.some((l) => l.vinculo) && (
                <Button type="button" variant="outline" size="sm" onClick={atualizarVinculadas}>
                  <RefreshCw aria-hidden className="mr-1 size-3.5" /> Atualizar do levantamento
                </Button>
              )}
            </div>
          )}

          {temAquecimentoEquatorial && <EscolhaFdAquecimento calculo={k} podeEditar={podeEditar} onChange={(v) => setK((x) => ({ ...x, fdAquecimento: v }))} />}

          {k.linhas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <caption className="sr-only">Linhas de carga de {k.nome}</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="w-6" aria-label="Reordenar" />
                    <th className="px-1 pb-1 font-medium">Descrição</th>
                    <th className="px-1 pb-1 font-medium">Tipo de carga</th>
                    <th className="px-1 pb-1 font-medium">Qtd</th>
                    <th className="px-1 pb-1 font-medium">Potência (kW)</th>
                    <th className="px-1 pb-1 font-medium">FP</th>
                    <th className="px-1 pb-1 font-medium">Carga instalada (kW)</th>
                    <th className="px-1 pb-1 font-medium">Carga instalada (kVA)</th>
                    <th className="px-1 pb-1 font-medium">FD</th>
                    <th className="px-1 pb-1 font-medium">Demanda (kVA)</th>
                    <th className="w-10" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {k.linhas.map((l, i) => (
                    <LinhaDeCarga
                      key={l.id}
                      conteudo={conteudo}
                      calculo={k}
                      linha={l}
                      indice={i}
                      resultadoLinha={resultado.linhas[i]}
                      totais={totais}
                      podeEditar={podeEditar}
                      onLinha={(f) => setK((x) => mapLinha(x, l.id, f))}
                      onAcao={(item) => void acaoLinha(l.id, item)}
                      onSoltar={(origem) => soltar(l.id, origem)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/50 text-center font-semibold tabular-nums">
                    <td colSpan={6} className="px-2 py-2 text-left">Total do cálculo</td>
                    <td>{fmt(resultado.cargaKW)} kW</td>
                    <td>{fmt(resultado.cargaKVA)} kVA</td>
                    <td />
                    <td>{fmt(resultado.demandaKVA)} kVA</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {k.linhas.length > 0 && resultado.cargaKW == null && (
            <p className="text-xs text-muted-foreground">Enquanto alguma linha estiver sem FP, o total fica em “—”.</p>
          )}

          {podeEditar && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setK((x) => ({ ...x, linhas: [...x.linhas, novaLinhaCarga()] }))} disabled={k.linhas.length >= 100}>
                <Plus aria-hidden className="mr-1 size-3.5" /> Carga
              </Button>
              {conteudo.concessionaria === "neoenergia" && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setK((x) => ({ ...x, linhas: [...x.linhas, ...linhasAdministracaoEdificios()] }))}>
                  <Plus aria-hidden className="mr-1 size-3.5" /> Administração de edifícios (duas linhas)
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LinhaDeCarga({
  conteudo,
  calculo: k,
  linha: l,
  indice,
  resultadoLinha,
  totais,
  podeEditar,
  onLinha,
  onAcao,
  onSoltar,
}: {
  conteudo: ConteudoCargasDemanda;
  calculo: CalculoEstudo;
  linha: LinhaCargaEstudo;
  indice: number;
  resultadoLinha: ReturnType<typeof calcularCalculoDeCargaInstalada>["linhas"][number];
  totais: ReturnType<typeof totaisDoEscopo>;
  podeEditar: boolean;
  onLinha: (f: (l: LinhaCargaEstudo) => LinhaCargaEstudo) => void;
  onAcao: (item: AcaoItemAcao) => void;
  onSoltar: (origemId: string) => void;
}) {
  const ctx = { concessionaria: conteudo.concessionaria, escopoN: k.escopo.quantidade, fdAquecimento: k.fdAquecimento, linhas: k.linhas };
  const fd = fdEfetivoDaLinha(ctx, l);
  const r = resultadoLinha;
  const regras = regrasOferecidas(conteudo.concessionaria, l.tipoCarga);
  const vinculo = estadoDoVinculo(l, totais);
  const itens = podeEditar
    ? itensDeLinhaDeCarga({
        indice,
        total: k.linhas.length,
        vinculada: l.vinculo != null,
        editada: vinculo.situacao === "diferente_do_levantamento",
        desatualizada: vinculo.levantamentoAlterado,
        linhasNoCalculo: k.linhas.length,
      })
    : [];
  const nome = l.descricao || `linha ${indice + 1}`;
  const equipamento = regraDaLinha(conteudo.concessionaria, l) === REGRA_EQT_AQUECIMENTO && k.fdAquecimento === "equipamento";
  const numero = (rotulo: string, valor: number | null, casas: number, set: (v: number | null) => void, extra?: { tom?: "sugerido" | "digitado"; placeholder?: string }) => (
    <CampoNumero rotulo={`${rotulo} de ${nome}`} valor={valor} casas={casas} maximoCasas={Math.max(casas, 4)} tom={extra?.tom ?? "digitado"} placeholder={extra?.placeholder ?? "digite"} desabilitado={!podeEditar} onChange={set} className="min-w-16" />
  );
  const arraste = podeEditar
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes("application/x-senahub-linha")) e.preventDefault();
        },
        onDrop: (e: React.DragEvent) => {
          const o = e.dataTransfer.getData("application/x-senahub-linha");
          if (o) {
            e.preventDefault();
            onSoltar(o);
          }
        },
      }
    : {};
  return (
    <LinhaComMenu itens={itens} onSelect={onAcao} render={<tr className="border-t align-top" {...arraste} />}>
      <td className="px-1 py-1.5">
        <span
          draggable={podeEditar}
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-senahub-linha", l.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          aria-hidden
          className={podeEditar ? "inline-flex cursor-grab touch-none text-muted-foreground/60 hover:text-foreground" : "inline-flex text-muted-foreground/30"}
        >
          <GripVertical className="size-4" />
        </span>
      </td>
      <td className="px-1 py-1.5">
        <Input aria-label={`Descrição da ${l.descricao ? l.descricao : `linha ${indice + 1}`}`} value={l.descricao} maxLength={120} disabled={!podeEditar} onChange={(e) => onLinha((x) => ({ ...x, descricao: e.target.value }))} className="min-w-36 text-center" />
        {l.vinculo && (
          <span className={vinculo.situacao === "diferente_do_levantamento" ? "mt-0.5 block text-center text-[11px] text-warning-text" : "mt-0.5 block text-center text-[11px] text-muted-foreground"}>
            {vinculo.situacao === "diferente_do_levantamento" ? "diferente do levantamento" : "do levantamento"}
            {vinculo.levantamentoAlterado && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-warning-text">
                <TriangleAlert aria-hidden className="size-3" /> levantamento alterado
              </span>
            )}
          </span>
        )}
        {regras.length > 0 && (
          <Select value={l.regraFd && regras.some((x) => x.id === l.regraFd) ? l.regraFd : SEM} disabled={!podeEditar} onValueChange={(v) => onLinha((x) => ({ ...x, regraFd: v && v !== SEM ? v : null }))}>
            <SelectTrigger className="mt-1 w-full" aria-label={`Tabela do FD de ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>FD digitado (sem tabela)</SelectItem>
              {regras.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {equipamento && (
          <Select value={l.subtipo ?? SEM} disabled={!podeEditar} onValueChange={(v) => onLinha((x) => ({ ...x, subtipo: v && v !== SEM ? v : null }))}>
            <SelectTrigger className="mt-1 w-full" aria-label={`Tipo de equipamento de ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Tipo de equipamento…</SelectItem>
              {GRUPOS_EQUIPAMENTO_EQUATORIAL.map((g) => (
                <SelectItem key={g.valor} value={g.valor}>
                  {g.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-1 py-1.5">
        <Select value={l.tipoCarga ?? SEM} disabled={!podeEditar} onValueChange={(v) => onLinha((x) => { const tipoCarga = v && v !== SEM ? (v as TipoCarga) : null; return { ...x, tipoCarga, regraFd: regraCabeNoTipo(x.regraFd, tipoCarga) ? x.regraFd : null }; })}>
          <SelectTrigger className="w-44 max-w-44" aria-label={`Tipo de carga de ${nome}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM}>Escolha…</SelectItem>
            {TIPOS_CARGA.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_CARGA_ROTULO[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-1 py-1.5">{numero("Quantidade", l.quantidade, 0, (v) => onLinha((x) => ({ ...x, quantidade: v == null ? null : Math.max(0, v) })))}</td>
      <td className="px-1 py-1.5">{numero("Potência (kW)", l.potenciaW == null ? null : l.potenciaW / 1000, 2, (v) => onLinha((x) => ({ ...x, potenciaW: v == null ? null : v * 1000 })))}</td>
      <td className="px-1 py-1.5">{numero("FP", l.fp, 2, (v) => onLinha((x) => ({ ...x, fp: v })))}</td>
      <td className="px-1 py-1.5">
        <CampoNumero rotulo={`Carga instalada de ${nome} (kW)`} valor={r.cargaKW} tom="calculado" somenteLeitura className="min-w-20" />
      </td>
      <td className="px-1 py-1.5">
        <CampoNumero rotulo={`Carga instalada de ${nome} (kVA)`} valor={r.cargaKVA} tom="calculado" somenteLeitura className="min-w-20" />
      </td>
      <td className="px-1 py-1.5">{numero("FD", fd.fd, 2, (v) => onLinha((x) => ({ ...x, fd: v })), { tom: fd.ehSugerido ? "sugerido" : "digitado" })}</td>
      <td className="px-1 py-1.5">
        <CampoNumero rotulo={`Demanda de ${nome} (kVA)`} valor={r.demandaKVA} tom="calculado" somenteLeitura className="min-w-20" />
      </td>
      <td className="px-1 py-1.5 text-center">
        <BotaoAcoes itens={itens} onSelect={onAcao} rotulo={`Ações da linha ${nome}`} className="size-7" />
      </td>
    </LinhaComMenu>
  );
}
