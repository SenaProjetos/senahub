"use client";

import { Plus } from "lucide-react";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { pontoDoAmbiente } from "@/modules/estudos/cargas-demanda/ambiente";
import { itensDePonto } from "@/modules/estudos/cargas-demanda/acoes-levantamento";
import type { AmbienteEstudo, CriterioIluminacao, PontoEstudo } from "@/modules/estudos/cargas-demanda/conteudo";
import { mapPonto, novoPonto } from "@/modules/estudos/cargas-demanda/edicao";

import { CampoNumero } from "./campos";

export type PropsTomadas = {
  ambiente: AmbienteEstudo;
  criterio: CriterioIluminacao | null;
  podeEditar: boolean;
  onAmbiente: (f: (a: AmbienteEstudo) => AmbienteEstudo) => void;
  onAcaoPonto: (pontoId: string, item: AcaoItemAcao) => void;
};

const nomeDoAmbiente = (a: AmbienteEstudo) => a.nome || "ambiente";

/**
 * Células da tomada de uso geral (quantidade, VA, W) do ambiente: o PRIMEIRO ponto de TUG. Em habitação a quantidade e a
 * potência vêm sugeridas pela norma (azul); o VA mostrado é o do conjunto (quantidade × VA por ponto).
 */
export function CelulasTug({ ambiente: a, criterio, podeEditar, onAmbiente }: PropsTomadas) {
  const ponto = a.pontos.find((p) => p.tipo === "tug");
  if (!ponto) {
    return (
      <td colSpan={3} className="px-1 py-1.5 text-center">
        <Button type="button" variant="ghost" size="sm" disabled={!podeEditar} onClick={() => onAmbiente((x) => ({ ...x, pontos: [novoPonto("tug"), ...x.pontos] }))}>
          <Plus aria-hidden className="mr-1 size-3.5" /> Tomadas de uso geral
        </Button>
      </td>
    );
  }
  const e = pontoDoAmbiente(a, ponto, criterio);
  const mudar = (f: (p: PontoEstudo) => PontoEstudo) => onAmbiente((x) => mapPonto(x, ponto.id, f));
  return (
    <>
      <td className="px-1 py-1.5">
        <CampoNumero
          rotulo={`Quantidade de tomadas de uso geral de ${nomeDoAmbiente(a)}`}
          valor={e.quantidade}
          casas={0}
          tom={e.quantidadeEhSugerida ? "sugerido" : "digitado"}
          placeholder="digite"
          desabilitado={!podeEditar}
          onChange={(v) => mudar((p) => ({ ...p, quantidade: v == null ? null : Math.max(0, Math.round(v)) }))}
          className="min-w-14"
        />
      </td>
      <td className="px-1 py-1.5">
        <CampoNumero
          rotulo={`Potência das tomadas de uso geral de ${nomeDoAmbiente(a)} (VA)`}
          valor={e.vaTotal}
          casas={0}
          tom={e.vaEhSugerido ? "sugerido" : "digitado"}
          placeholder="digite"
          desabilitado={!podeEditar}
          // A tela mostra o conjunto; o documento guarda o VA por ponto (quantidade × VA por ponto = conjunto).
          onChange={(v) => mudar((p) => ({ ...p, vaPorPonto: v == null ? null : v / Math.max(e.quantidade ?? 1, 1) }))}
          className="min-w-20"
        />
      </td>
      <td className="px-1 py-1.5">
        <CampoNumero rotulo={`Potência ativa das tomadas de uso geral de ${nomeDoAmbiente(a)} (W)`} valor={e.w} casas={2} tom="calculado" somenteLeitura className="min-w-[6.5rem]" />
      </td>
    </>
  );
}

/** Tomadas de uso específico (e "outro") do ambiente: lista de descrição, quantidade, VA e W, com menu por linha. */
export function CelulaTue(props: PropsTomadas) {
  const { ambiente: a, criterio, podeEditar, onAmbiente } = props;
  const lista = a.pontos.filter((p) => p.tipo !== "tug");
  return (
    <td className="px-1 py-1.5 align-top">
      <div className="flex min-w-[28rem] flex-col gap-1.5">
        {lista.length === 0 && <span className="px-1 text-center text-xs text-muted-foreground">Nenhuma</span>}
        {lista.map((p, i) => (
          <LinhaTue key={p.id} {...props} ponto={p} indice={i} total={lista.length} totalPontos={a.pontos.length} criterio={criterio} />
        ))}
        {podeEditar && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onAmbiente((x) => ({ ...x, pontos: [...x.pontos, novoPonto("tue")] }))}>
            <Plus aria-hidden className="mr-1 size-3.5" /> Tomada de uso específico
          </Button>
        )}
      </div>
    </td>
  );
}

function LinhaTue({
  ambiente: a,
  ponto: p,
  indice,
  total,
  totalPontos,
  criterio,
  podeEditar,
  onAmbiente,
  onAcaoPonto,
}: PropsTomadas & { ponto: PontoEstudo; indice: number; total: number; totalPontos: number }) {
  const e = pontoDoAmbiente(a, p, criterio);
  const itens = podeEditar ? itensDePonto({ indice, total, pontos: totalPontos }) : [];
  const mudar = (f: (x: PontoEstudo) => PontoEstudo) => onAmbiente((x) => mapPonto(x, p.id, f));
  return (
    <LinhaComMenu itens={itens} onSelect={(item) => onAcaoPonto(p.id, item)} render={<div className="grid grid-cols-[minmax(7rem,1fr)_3rem_5rem_6.5rem_1.75rem] items-center gap-1" />}>
      <Input
        aria-label={`Descrição da tomada de uso específico de ${nomeDoAmbiente(a)}`}
        value={p.descricao}
        placeholder="Equipamento"
        maxLength={80}
        disabled={!podeEditar}
        onChange={(ev) => mudar((x) => ({ ...x, descricao: ev.target.value }))}
        className="text-center"
      />
      <CampoNumero
        rotulo={`Quantidade de ${p.descricao || "tomada de uso específico"} em ${nomeDoAmbiente(a)}`}
        valor={e.quantidade}
        casas={0}
        placeholder="1"
        desabilitado={!podeEditar}
        onChange={(v) => mudar((x) => ({ ...x, quantidade: v == null ? null : Math.max(0, Math.round(v)) }))}
      />
      <CampoNumero
        rotulo={`Potência de ${p.descricao || "tomada de uso específico"} em ${nomeDoAmbiente(a)} (VA)`}
        valor={e.vaTotal}
        casas={0}
        placeholder="digite"
        desabilitado={!podeEditar}
        onChange={(v) => mudar((x) => ({ ...x, vaPorPonto: v == null ? null : v / Math.max(e.quantidade ?? 1, 1) }))}
      />
      <CampoNumero rotulo={`Potência ativa de ${p.descricao || "tomada de uso específico"} em ${nomeDoAmbiente(a)} (W)`} valor={e.w} casas={2} tom="calculado" somenteLeitura />
      {itens.length > 0 ? <BotaoAcoes itens={itens} onSelect={(item) => onAcaoPonto(p.id, item)} rotulo={`Ações da tomada ${p.descricao || indice + 1}`} className="size-7" /> : <span />}
    </LinhaComMenu>
  );
}
