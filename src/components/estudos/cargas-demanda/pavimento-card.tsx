"use client";

import { Plus } from "lucide-react";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import {
  ACAO_AMB_ADICIONAR_TUE,
  ACAO_AMB_DESCER,
  ACAO_AMB_DUPLICAR,
  ACAO_AMB_EXCLUIR,
  ACAO_AMB_SUBIR,
  ACAO_PAV_ADICIONAR_AMBIENTE,
  ACAO_PAV_DESCER,
  ACAO_PAV_DUPLICAR,
  ACAO_PAV_EXCLUIR,
  ACAO_PAV_SUBIR,
  ACAO_PONTO_DESCER,
  ACAO_PONTO_DUPLICAR,
  ACAO_PONTO_EXCLUIR,
  ACAO_PONTO_SUBIR,
  itensDeAmbiente,
  itensDePavimento,
} from "@/modules/estudos/cargas-demanda/acoes-levantamento";
import { MAX_AMBIENTES, type AmbienteEstudo, type ConteudoCargasDemanda, type LevantamentoEstudo, type PavimentoEstudo } from "@/modules/estudos/cargas-demanda/conteudo";
import {
  copiarAmbiente,
  copiarPavimento,
  copiarPonto,
  fpsDoLevantamento,
  mapAmbiente,
  mapLevantamento,
  mapPavimento,
  mover,
  novoAmbiente,
  novoPonto,
  totalDeAmbientes,
} from "@/modules/estudos/cargas-demanda/edicao";
import { totaisDosAmbientes } from "@/modules/estudos/cargas-demanda/levantamento";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";

import { LinhaHabitacao, LinhaLux, LinhaTomadasLux, type PropsLinha } from "./linha-ambiente";
import type { Atualizar } from "./tipos";

type Props = {
  conteudo: ConteudoCargasDemanda;
  levantamento: LevantamentoEstudo;
  pavimento: PavimentoEstudo;
  indice: number;
  total: number;
  atualizar: Atualizar;
  podeEditar: boolean;
};

const fmt = (v: number | null, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));

function soma(vs: readonly (number | null)[]): number | null {
  return vs.some((v) => v == null) ? null : vs.reduce<number>((s, v) => s + (v as number), 0);
}

/** Pavimento: nome, ambientes (uma tabela por critério), total e "+ Ambiente". */
export function PavimentoCard({ conteudo, levantamento: lev, pavimento: pav, indice, total, atualizar, podeEditar }: Props) {
  const confirm = useConfirm();
  const criterio = conteudo.criterioIluminacao;
  const noEstudo = totalDeAmbientes(conteudo);
  const setPav = (f: (p: PavimentoEstudo) => PavimentoEstudo) => atualizar((c) => mapLevantamento(c, lev.id, (l) => mapPavimento(l, pav.id, f)));
  const setLev = (f: (l: LevantamentoEstudo) => LevantamentoEstudo) => atualizar((c) => mapLevantamento(c, lev.id, f));

  async function confirmar(item: AcaoItemAcao): Promise<boolean> {
    if (!item.confirmar) return true;
    return confirm({
      title: item.confirmar.titulo,
      description: item.confirmar.descricao,
      confirmLabel: item.confirmar.rotuloConfirmar,
      variant: item.variant === "destructive" ? "destructive" : "default",
    });
  }

  // Cada ação acha o item pelo id DEPOIS da confirmação: a lista pode ter mudado com o diálogo aberto.
  async function acaoPavimento(item: AcaoItemAcao) {
    if (!(await confirmar(item))) return;
    if (item.id === ACAO_PAV_ADICIONAR_AMBIENTE) {
      return setLev((l) => {
        const fps = fpsDoLevantamento(l);
        const n = l.pavimentos.reduce((s, p) => s + p.ambientes.length, 0) + 1;
        return mapPavimento(l, pav.id, (p) => ({ ...p, ambientes: [...p.ambientes, novoAmbiente(`Ambiente ${n}`, fps)] }));
      });
    }
    if (item.id === ACAO_PAV_DUPLICAR) {
      return setLev((l) => {
        const i = l.pavimentos.findIndex((p) => p.id === pav.id);
        return i < 0 ? l : { ...l, pavimentos: [...l.pavimentos.slice(0, i + 1), copiarPavimento(l.pavimentos[i]), ...l.pavimentos.slice(i + 1)] };
      });
    }
    if (item.id === ACAO_PAV_SUBIR || item.id === ACAO_PAV_DESCER) {
      return setLev((l) => {
        const i = l.pavimentos.findIndex((p) => p.id === pav.id);
        return { ...l, pavimentos: mover(l.pavimentos, i, item.id === ACAO_PAV_SUBIR ? i - 1 : i + 1) };
      });
    }
    if (item.id === ACAO_PAV_EXCLUIR) return setLev((l) => ({ ...l, pavimentos: l.pavimentos.filter((p) => p.id !== pav.id) }));
  }

  async function acaoAmbiente(ambienteId: string, item: AcaoItemAcao) {
    if (!(await confirmar(item))) return;
    setPav((p) => {
      const i = p.ambientes.findIndex((a) => a.id === ambienteId);
      if (i < 0) return p;
      if (item.id === ACAO_AMB_ADICIONAR_TUE) return mapAmbiente(p, ambienteId, (a) => ({ ...a, pontos: [...a.pontos, novoPonto("tue")] }));
      if (item.id === ACAO_AMB_DUPLICAR) return { ...p, ambientes: [...p.ambientes.slice(0, i + 1), copiarAmbiente(p.ambientes[i]), ...p.ambientes.slice(i + 1)] };
      if (item.id === ACAO_AMB_SUBIR) return { ...p, ambientes: mover(p.ambientes, i, i - 1) };
      if (item.id === ACAO_AMB_DESCER) return { ...p, ambientes: mover(p.ambientes, i, i + 1) };
      if (item.id === ACAO_AMB_EXCLUIR) return { ...p, ambientes: p.ambientes.filter((a) => a.id !== ambienteId) };
      return p;
    });
  }

  async function acaoPonto(ambienteId: string, pontoId: string, item: AcaoItemAcao) {
    if (!(await confirmar(item))) return;
    setPav((p) =>
      mapAmbiente(p, ambienteId, (a) => {
        const i = a.pontos.findIndex((pt) => pt.id === pontoId);
        if (i < 0) return a;
        // As posições valem na lista de pontos que não são o TUG primeiro: o TUG fica onde está.
        const fora = a.pontos.map((pt, k) => ({ pt, k })).filter(({ pt }) => pt.tipo !== "tug");
        const pos = fora.findIndex(({ k }) => k === i);
        if (item.id === ACAO_PONTO_DUPLICAR) return { ...a, pontos: [...a.pontos.slice(0, i + 1), copiarPonto(a.pontos[i]), ...a.pontos.slice(i + 1)] };
        if (item.id === ACAO_PONTO_SUBIR || item.id === ACAO_PONTO_DESCER) {
          const alvo = fora[pos + (item.id === ACAO_PONTO_SUBIR ? -1 : 1)];
          return alvo ? { ...a, pontos: mover(a.pontos, i, alvo.k) } : a;
        }
        if (item.id === ACAO_PONTO_EXCLUIR) return { ...a, pontos: a.pontos.filter((pt) => pt.id !== pontoId) };
        return a;
      }),
    );
  }

  function soltar(destinoId: string, origemId: string) {
    if (origemId === destinoId) return;
    setPav((p) => {
      const de = p.ambientes.findIndex((a) => a.id === origemId);
      const para = p.ambientes.findIndex((a) => a.id === destinoId);
      return de < 0 || para < 0 ? p : { ...p, ambientes: mover(p.ambientes, de, para) }; // origem de outro pavimento: ignora
    });
  }

  const itensPavimento = podeEditar
    ? itensDePavimento({ indice, total, totalPavimentos: total, ambientes: pav.ambientes.length, ambientesNoEstudo: noEstudo })
    : [];

  const propsLinha = (a: AmbienteEstudo, i: number): PropsLinha => ({
    ambiente: a,
    indice: i,
    criterio,
    podeEditar,
    peDireitoM: conteudo.peDireitoM,
    catalogo: conteudo.luminarias,
    itens: podeEditar ? itensDeAmbiente({ indice: i, total: pav.ambientes.length, pontos: a.pontos.length, ambientesNoEstudo: noEstudo }) : [],
    onAmbiente: (f) => setPav((p) => mapAmbiente(p, a.id, f)),
    onAcaoAmbiente: (item) => void acaoAmbiente(a.id, item),
    onAcaoPonto: (pontoId, item) => void acaoPonto(a.id, pontoId, item),
    onSoltar: (origemId) => soltar(a.id, origemId),
  });

  const t = totaisDosAmbientes(pav.ambientes, conteudo);
  const tue = { va: soma(t.equipamentos.map((e) => e.total.va)), w: soma(t.equipamentos.map((e) => e.total.w)) };
  const vazio = pav.ambientes.length === 0;
  const novoAmb = () => void acaoPavimento({ tipo: "acao", id: ACAO_PAV_ADICIONAR_AMBIENTE, rotulo: "Adicionar ambiente" });

  return (
    <section aria-label={`Pavimento ${pav.nome}`} className="rounded-lg border bg-card">
      <LinhaComMenu itens={itensPavimento} onSelect={(i) => void acaoPavimento(i)} render={<header className="flex flex-wrap items-center gap-2 border-b px-3 py-2" />}>
        <Input
          aria-label="Nome do pavimento"
          value={pav.nome}
          maxLength={80}
          disabled={!podeEditar}
          onChange={(e) => setPav((p) => ({ ...p, nome: e.target.value }))}
          className="h-8 max-w-60 border-transparent bg-transparent font-semibold hover:border-input"
        />
        <span className="text-xs text-muted-foreground">{pav.ambientes.length} ambiente(s)</span>
        <span className="ml-auto" />
        <BotaoAcoes itens={itensPavimento} onSelect={(i) => void acaoPavimento(i)} rotulo={`Ações do pavimento ${pav.nome}`} className="size-8" />
      </LinhaComMenu>

      {criterio === null && <p className="px-3 py-4 text-sm text-muted-foreground">Escolha o critério de iluminação acima para lançar os ambientes.</p>}

      {criterio === "habitacao" && !vazio && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <caption className="sr-only">Ambientes de {pav.nome}</caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="w-6" rowSpan={2} aria-label="Reordenar" />
                <th rowSpan={2} className="px-1 pb-1 font-medium">Ambiente</th>
                <th rowSpan={2} className="px-1 pb-1 font-medium">Tipo</th>
                <th colSpan={2} className="px-1 pt-2 font-medium">Medidas</th>
                <th colSpan={2} className="px-1 pt-2 font-medium">Iluminação</th>
                <th colSpan={3} className="px-1 pt-2 font-medium">Tomadas de uso geral</th>
                <th className="px-1 pt-2 font-medium">Tomadas de uso específico</th>
                <th rowSpan={2} className="w-10" aria-label="Ações" />
              </tr>
              <tr>
                <th className="px-1 pb-1 font-medium">Área (m²)</th>
                <th className="px-1 pb-1 font-medium">Perímetro (m)</th>
                <th className="px-1 pb-1 font-medium">VA</th>
                <th className="px-1 pb-1 font-medium">W</th>
                <th className="px-1 pb-1 font-medium">Qtd</th>
                <th className="px-1 pb-1 font-medium">VA</th>
                <th className="px-1 pb-1 font-medium">W</th>
                <th className="px-1 pb-1 font-medium">Descrição · Qtd · VA · W</th>
              </tr>
            </thead>
            <tbody>
              {pav.ambientes.map((a, i) => (
                <LinhaHabitacao key={a.id} {...propsLinha(a, i)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/50 text-center font-semibold tabular-nums">
                <td colSpan={5} className="px-2 py-2 text-left">Total do pavimento</td>
                <td>{fmt(t.iluminacao.va, 0)} VA</td>
                <td>{fmt(t.iluminacao.w)} W</td>
                <td>{fmt(t.tug.quantidade, 0)}</td>
                <td>{fmt(t.tug.va, 0)} VA</td>
                <td>{fmt(t.tug.w)} W</td>
                <td className="px-2 text-left">{fmt(tue.va, 0)} VA · {fmt(tue.w)} W</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {criterio === "lux" && !vazio && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <caption className="sr-only">Iluminação por iluminância de {pav.nome}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="w-6" aria-label="Reordenar" />
                  {["Ambiente", "Atividade", "Área (m²)", "Perímetro (m)", "Plano (m)", "Em (lux)", "K", "Luminária", "Fu", "Fm", "Sugerida", "Escolhida", "Final (lux)", "W", "VA"].map((h) => (
                    <th key={h} className="px-1 pb-1 font-medium">{h}</th>
                  ))}
                  <th className="w-10" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {pav.ambientes.map((a, i) => (
                  <LinhaLux key={a.id} {...propsLinha(a, i)} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/50 text-center font-semibold tabular-nums">
                  <td colSpan={14} className="px-2 py-2 text-left">Total do pavimento</td>
                  <td>{fmt(t.iluminacao.w)} W</td>
                  <td>{fmt(t.iluminacao.va)} VA</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="border-t px-3 py-2">
            <CollapsibleSection titulo="Tomadas" descricao="Fora de habitação, você digita a quantidade e a potência." resumo={<span className="text-xs text-muted-foreground">{fmt(t.tug.va, 0)} VA de uso geral</span>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <caption className="sr-only">Tomadas de {pav.nome}</caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="w-6" aria-label="Reordenar" />
                      <th className="px-1 pb-1 font-medium">Ambiente</th>
                      <th className="px-1 pb-1 font-medium">Qtd (uso geral)</th>
                      <th className="px-1 pb-1 font-medium">VA</th>
                      <th className="px-1 pb-1 font-medium">W</th>
                      <th className="px-1 pb-1 font-medium">Tomadas de uso específico</th>
                      <th className="w-10" aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {pav.ambientes.map((a, i) => (
                      <LinhaTomadasLux key={a.id} {...propsLinha(a, i)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </div>
        </>
      )}

      {criterio !== null && vazio && <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum ambiente neste pavimento.</p>}

      {criterio !== null && podeEditar && (
        <div className="px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="" onClick={novoAmb} disabled={noEstudo >= MAX_AMBIENTES}>
            <Plus aria-hidden className="mr-1 size-3.5" /> Ambiente
          </Button>
        </div>
      )}
    </section>
  );
}
