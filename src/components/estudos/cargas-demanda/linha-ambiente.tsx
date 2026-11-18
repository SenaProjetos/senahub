"use client";

import { GripVertical, TriangleAlert } from "lucide-react";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { avisosDoAmbiente, iluminacaoDoAmbienteCompleta } from "@/modules/estudos/cargas-demanda/ambiente";
import type { AmbienteEstudo, CriterioIluminacao, LuminariaEstudo } from "@/modules/estudos/cargas-demanda/conteudo";
import { TIPOS_COMODO, TIPO_COMODO_ROTULO } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr5410-habitacao";

import { CampoNumero } from "./campos";
import { CelulaTue, CelulasTug, type PropsTomadas } from "./celulas-tomadas";
import { SeletorAtividade } from "./seletor-atividade";

export type PropsLinha = PropsTomadas & {
  indice: number;
  itens: AcaoItem[];
  peDireitoM: number | null;
  catalogo: LuminariaEstudo[];
  onAcaoAmbiente: (item: AcaoItemAcao) => void;
  /** Soltou a linha de `origemId` sobre esta. */
  onSoltar: (origemId: string) => void;
};

const SEM = "__sem__";

/**
 * Alça da linha (spec §3.2): arrastar muda a posição dentro do pavimento; o teclado usa "Mover para cima/baixo" do `⋯`
 * (mesmo menu do botão direito). A ordem da tela é a ordem do relatório.
 */
function Alca({ ambienteId, ativo }: { ambienteId: string; ativo: boolean }) {
  return (
    <span
      draggable={ativo}
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ARRASTE, ambienteId);
        e.dataTransfer.effectAllowed = "move";
      }}
      aria-hidden
      className={ativo ? "inline-flex cursor-grab touch-none text-muted-foreground/60 hover:text-foreground" : "inline-flex text-muted-foreground/30"}
    >
      <GripVertical className="size-4" />
    </span>
  );
}

const TIPO_ARRASTE = "application/x-senahub-ambiente";

/** Atributos da `<tr>` que aceita uma linha arrastada (só ambientes do mesmo pavimento; quem decide é o pai). */
function destinoDeArraste(onSoltar: (origemId: string) => void, ativo: boolean) {
  if (!ativo) return {};
  return {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(TIPO_ARRASTE)) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const origem = e.dataTransfer.getData(TIPO_ARRASTE);
      if (origem) {
        e.preventDefault();
        onSoltar(origem);
      }
    },
  };
}

/** Célula do `⋯` da linha (teclado e toque: tudo o que o botão direito faz). */
function CelulaAcoes({ itens, onSelect, rotulo }: { itens: AcaoItem[]; onSelect: (i: AcaoItemAcao) => void; rotulo: string }) {
  return (
    <td className="px-1 py-1.5 text-center">
      <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={rotulo} className="size-7" />
    </td>
  );
}

function Avisos({ a, criterio, peDireitoM, catalogo, colunas }: { a: AmbienteEstudo; criterio: CriterioIluminacao | null; peDireitoM: number | null; catalogo: LuminariaEstudo[]; colunas: number }) {
  const avisos = avisosDoAmbiente(a, criterio, peDireitoM, catalogo);
  if (avisos.length === 0) return null;
  return (
    <tr>
      <td colSpan={colunas} className="px-2 pb-2">
        <ul className="space-y-1 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-xs text-warning-text">
          {avisos.map((m, i) => (
            <li key={`${m.id}-${i}`} className="flex items-start gap-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong className="font-semibold">{a.nome || "Ambiente"}:</strong> {m.texto}
              </span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

/** Linha do ambiente, critério de habitação: medidas, iluminação, tomadas de uso geral e específico (tudo em uma linha). */
export function LinhaHabitacao(props: PropsLinha) {
  const { ambiente: a, criterio, podeEditar, onAmbiente, itens, onAcaoAmbiente, peDireitoM, catalogo, onSoltar } = props;
  const il = iluminacaoDoAmbienteCompleta(a, criterio, peDireitoM, catalogo);
  const nome = a.nome || "ambiente";
  return (
    <>
      <LinhaComMenu itens={itens} onSelect={onAcaoAmbiente} render={<tr className="border-t align-top" {...destinoDeArraste(onSoltar, podeEditar)} />}>
        <td className="px-1 py-1.5"><Alca ambienteId={a.id} ativo={podeEditar} /></td>
        <td className="px-1 py-1.5">
          <Input aria-label="Nome do ambiente" value={a.nome} maxLength={80} disabled={!podeEditar} onChange={(e) => onAmbiente((x) => ({ ...x, nome: e.target.value }))} className="min-w-28 text-center" />
        </td>
        <td className="px-1 py-1.5">
          <Select value={a.tipo ?? SEM} disabled={!podeEditar} onValueChange={(v) => onAmbiente((x) => ({ ...x, tipo: v && v !== SEM ? (v as (typeof TIPOS_COMODO)[number]) : null }))}>
            <SelectTrigger className="w-44 max-w-44" aria-label={`Tipo do ambiente ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              {TIPOS_COMODO.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_COMODO_ROTULO[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Área de ${nome} (m²)`} valor={a.areaM2} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => onAmbiente((x) => ({ ...x, areaM2: v }))} className="min-w-20" />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Perímetro de ${nome} (m)`} valor={a.perimetroM} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => onAmbiente((x) => ({ ...x, perimetroM: v }))} className="min-w-20" />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero
            rotulo={`Potência de iluminação de ${nome} (VA)`}
            valor={il.va}
            casas={0}
            tom={il.ehSugerido ? "sugerido" : "digitado"}
            placeholder="digite"
            desabilitado={!podeEditar}
            onChange={(v) => onAmbiente((x) => ({ ...x, iluminacao: { ...x.iluminacao, vaAdotado: v } }))}
            className="min-w-16"
          />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Potência ativa de iluminação de ${nome} (W)`} valor={il.w} tom="calculado" somenteLeitura className="min-w-20" />
        </td>
        <CelulasTug {...props} />
        <CelulaTue {...props} />
        <CelulaAcoes itens={itens} onSelect={onAcaoAmbiente} rotulo={`Ações do ambiente ${nome}`} />
      </LinhaComMenu>
      <Avisos a={a} criterio={criterio} peDireitoM={peDireitoM} catalogo={catalogo} colunas={13} />
    </>
  );
}

/** Linha do ambiente, critério de iluminância (lux): medidas, atividade, Em, luminária, quantidade e o resultado. */
export function LinhaLux(props: PropsLinha) {
  const { ambiente: a, criterio, podeEditar, onAmbiente, itens, onAcaoAmbiente, peDireitoM, catalogo, onSoltar } = props;
  const il = iluminacaoDoAmbienteCompleta(a, criterio, peDireitoM, catalogo);
  const lux = il.lux;
  const nome = a.nome || "ambiente";
  const emAdotado = a.iluminacao.emLux ?? il.emSugerido;
  const abaixo = !!lux && lux.iluminanciaFinalLux < (emAdotado ?? 0);
  const campo = (rotulo: string, valor: number | null, set: (v: number | null) => void, casas = 2, largura = "min-w-14") => (
    <td className="px-1 py-1.5">
      <CampoNumero rotulo={`${rotulo} de ${nome}`} valor={valor} casas={casas} placeholder="digite" desabilitado={!podeEditar} onChange={set} className={largura} />
    </td>
  );
  return (
    <>
      <LinhaComMenu itens={itens} onSelect={onAcaoAmbiente} render={<tr className="border-t align-top" {...destinoDeArraste(onSoltar, podeEditar)} />}>
        <td className="px-1 py-1.5"><Alca ambienteId={a.id} ativo={podeEditar} /></td>
        <td className="px-1 py-1.5">
          <Input aria-label="Nome do ambiente" value={a.nome} maxLength={80} disabled={!podeEditar} onChange={(e) => onAmbiente((x) => ({ ...x, nome: e.target.value }))} className="min-w-28 text-center" />
        </td>
        <td className="px-1 py-1.5">
          <SeletorAtividade
            rotulo={`Atividade de ${nome}`}
            atividadeId={a.atividadeId}
            desabilitado={!podeEditar}
            onChange={(id) => onAmbiente((x) => ({ ...x, atividadeId: id, iluminacao: { ...x.iluminacao, emLux: null } }))}
          />
        </td>
        {campo("Área (m²)", a.areaM2, (v) => onAmbiente((x) => ({ ...x, areaM2: v })))}
        {campo("Perímetro (m)", a.perimetroM, (v) => onAmbiente((x) => ({ ...x, perimetroM: v })))}
        {campo("Plano de trabalho (m)", a.alturaPlanoM, (v) => onAmbiente((x) => ({ ...x, alturaPlanoM: v })))}
        <td className="px-1 py-1.5">
          <CampoNumero
            rotulo={`Iluminância mantida (lux) de ${nome}`}
            valor={emAdotado}
            casas={0}
            tom={a.iluminacao.emLux == null && il.emSugerido != null ? "sugerido" : "digitado"}
            placeholder="digite"
            desabilitado={!podeEditar}
            onChange={(v) => onAmbiente((x) => ({ ...x, iluminacao: { ...x.iluminacao, emLux: v } }))}
            className="min-w-16"
          />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Índice do recinto K de ${nome}`} valor={lux?.indiceK ?? null} tom="calculado" somenteLeitura className="min-w-14" />
        </td>
        <td className="px-1 py-1.5">
          <Select
            value={a.iluminacao.luminariaId ?? SEM}
            disabled={!podeEditar}
            onValueChange={(v) => onAmbiente((x) => ({ ...x, iluminacao: { ...x.iluminacao, luminariaId: v && v !== SEM ? v : null } }))}
          >
            <SelectTrigger className="w-full min-w-16" aria-label={`Luminária de ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              {catalogo.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.codigo}
                  {l.descricao ? ` · ${l.descricao}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        {campo("Fator de utilização", a.iluminacao.fu, (v) => onAmbiente((x) => ({ ...x, iluminacao: { ...x.iluminacao, fu: v } })))}
        {campo("Fator de manutenção", a.iluminacao.fm, (v) => onAmbiente((x) => ({ ...x, iluminacao: { ...x.iluminacao, fm: v } })))}
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Quantidade sugerida de luminárias de ${nome}`} valor={lux?.quantidadeSugerida ?? null} casas={0} tom="calculado" somenteLeitura className="min-w-14" />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero
            rotulo={`Quantidade escolhida de luminárias de ${nome}`}
            valor={lux?.quantidade ?? null}
            casas={0}
            tom={abaixo ? "alerta" : a.iluminacao.quantidade == null && lux ? "sugerido" : "digitado"}
            desabilitado={!podeEditar}
            onChange={(v) => onAmbiente((x) => ({ ...x, iluminacao: { ...x.iluminacao, quantidade: v == null ? null : Math.max(0, Math.round(v)) } }))}
            className="min-w-14"
          />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Iluminância final (lux) de ${nome}`} valor={lux?.iluminanciaFinalLux ?? null} casas={0} tom={abaixo ? "alerta" : "calculado"} somenteLeitura className="min-w-14" />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Potência ativa de ${nome} (W)`} valor={il.w} tom="calculado" somenteLeitura className="min-w-16" />
        </td>
        <td className="px-1 py-1.5">
          <CampoNumero rotulo={`Potência aparente de ${nome} (VA)`} valor={il.va} tom="calculado" somenteLeitura className="min-w-16" />
        </td>
        <CelulaAcoes itens={itens} onSelect={onAcaoAmbiente} rotulo={`Ações do ambiente ${nome}`} />
      </LinhaComMenu>
      <Avisos a={a} criterio={criterio} peDireitoM={peDireitoM} catalogo={catalogo} colunas={17} />
    </>
  );
}

/** Linha da tabela de tomadas do critério de lux ("1B Tomadas"): o ambiente (só leitura) com TUG e TUE. */
export function LinhaTomadasLux(props: PropsLinha) {
  const { ambiente: a, itens, onAcaoAmbiente, onSoltar, podeEditar } = props;
  return (
    <LinhaComMenu itens={itens} onSelect={onAcaoAmbiente} render={<tr className="border-t align-top" {...destinoDeArraste(onSoltar, podeEditar)} />}>
      <td className="px-1 py-1.5"><Alca ambienteId={a.id} ativo={podeEditar} /></td>
      <td className="px-2 py-2 text-center text-sm font-medium">{a.nome || "Ambiente sem nome"}</td>
      <CelulasTug {...props} />
      <CelulaTue {...props} />
      <CelulaAcoes itens={itens} onSelect={onAcaoAmbiente} rotulo={`Ações do ambiente ${a.nome || "sem nome"}`} />
    </LinhaComMenu>
  );
}
