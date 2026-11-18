"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Info, Layers, Plus } from "lucide-react";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACAO_LEV_DUPLICAR, ACAO_LEV_EXCLUIR, itensDeLevantamento } from "@/modules/estudos/cargas-demanda/acoes-levantamento";
import {
  CRITERIOS_ILUMINACAO,
  MAX_PAVIMENTOS,
  ambientesDoLevantamento,
  type CriterioIluminacao,
  type LevantamentoEstudo,
} from "@/modules/estudos/cargas-demanda/conteudo";
import {
  MOTIVO_LEVANTAMENTOS_CHEIO,
  MOTIVO_PAVIMENTOS_CHEIO,
  ambientesQueUsam,
  calculosQueCitam,
  copiarLevantamento,
  definirFp,
  fpsDoLevantamento,
  mapLevantamento,
  novaLuminaria,
  novoLevantamento,
  novoPavimento,
  removerLevantamento,
  removerLuminaria,
  totalDeAmbientes,
} from "@/modules/estudos/cargas-demanda/edicao";
import { MSG } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";
import { MAX_LEVANTAMENTOS, MAX_LUMINARIAS } from "@/modules/estudos/cargas-demanda/conteudo";

import { CampoNumero, LegendaDasCores, Rotulo } from "./campos";
import { PavimentoCard } from "./pavimento-card";
import { ResumoDosLevantamentos } from "./resumo-levantamentos";
import type { PropsEtapa } from "./tipos";

const ROTULO_CRITERIO: Record<CriterioIluminacao, string> = { habitacao: "Habitação", lux: "Iluminância (lux)" };
const SEM = "__sem__";

/** Texto do aviso de edição da norma, da spec §6 (a única mensagem que cita norma na tela). */
const AVISO_EDICAO: Record<CriterioIluminacao, string> = {
  habitacao: MSG.edicaoAConfirmar("NBR 5410", "2004").texto,
  lux: MSG.edicaoAConfirmar("NBR ISO/CIE 8995-1", "2013").texto,
};

export function EtapaLevantamento({ conteudo, atualizar, podeEditar, onContinuar }: PropsEtapa & { onContinuar: () => void }) {
  const confirm = useConfirm();
  const [selecionado, setSelecionado] = useState<string | null>(conteudo.levantamentos[0]?.id ?? null);
  const lev = conteudo.levantamentos.find((l) => l.id === selecionado) ?? conteudo.levantamentos[0] ?? null;
  // O levantamento escolhido some (excluído, ou o documento foi trocado): volta ao primeiro.
  useEffect(() => {
    if (selecionado !== null && !conteudo.levantamentos.some((l) => l.id === selecionado)) setSelecionado(conteudo.levantamentos[0]?.id ?? null);
  }, [conteudo.levantamentos, selecionado]);

  const criterio = conteudo.criterioIluminacao;
  const noEstudo = totalDeAmbientes(conteudo);
  const fps = useMemo(() => (lev ? fpsDoLevantamento(lev) : { iluminacao: null, tug: null }), [lev]);

  function novo() {
    const nome = `Levantamento ${conteudo.levantamentos.length + 1}`;
    const l = novoLevantamento(nome);
    atualizar((c) => ({ ...c, levantamentos: [...c.levantamentos, l] }));
    setSelecionado(l.id);
  }

  const setLev = (f: (l: LevantamentoEstudo) => LevantamentoEstudo) => lev && atualizar((c) => mapLevantamento(c, lev.id, f));

  async function acaoLevantamento(item: AcaoItemAcao) {
    if (!lev) return;
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    if (item.id === ACAO_LEV_DUPLICAR) {
      const copia = copiarLevantamento(lev);
      atualizar((c) => ({ ...c, levantamentos: [...c.levantamentos, copia] }));
      setSelecionado(copia.id);
    } else if (item.id === ACAO_LEV_EXCLUIR) {
      atualizar((c) => removerLevantamento(c, lev.id));
    }
  }

  const itensLev = (l: LevantamentoEstudo) =>
    podeEditar
      ? itensDeLevantamento({
          totalLevantamentos: conteudo.levantamentos.length,
          ambientes: ambientesDoLevantamento(l).length,
          ambientesNoEstudo: noEstudo,
          citadoPor: calculosQueCitam(conteudo, l.id),
        })
      : [];

  if (conteudo.levantamentos.length === 0 || !lev) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhum levantamento ainda"
        description="Um levantamento reúne os pavimentos e ambientes de um tipo de unidade (ex.: Flat tipo A, Condomínio, Loja)."
        action={
          podeEditar ? (
            <Button type="button" size="sm" onClick={novo}>
              <Plus aria-hidden className="mr-1.5 size-4" /> Novo levantamento
            </Button>
          ) : undefined
        }
      />
    );
  }

  const cheio = conteudo.levantamentos.length >= MAX_LEVANTAMENTOS;

  return (
    <section aria-label="Levantamento" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-base font-bold">Levantamentos</h2>
        {conteudo.levantamentos.map((l) => (
          <LinhaComMenu key={l.id} itens={itensLev(l)} onSelect={(i) => { setSelecionado(l.id); void acaoLevantamento(i); }} render={<span className="inline-flex" />}>
            <button
              type="button"
              aria-pressed={l.id === lev.id}
              onClick={() => setSelecionado(l.id)}
              className="rounded-md border px-3 py-1.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-muted"
            >
              {l.nome}
            </button>
          </LinhaComMenu>
        ))}
        {podeEditar && (
          <Button type="button" variant="outline" size="sm" onClick={novo} disabled={cheio} title={cheio ? MOTIVO_LEVANTAMENTOS_CHEIO : undefined} className="">
            <Plus aria-hidden className="mr-1 size-3.5" /> Novo levantamento
          </Button>
        )}
        <span className="ml-auto" />
        <LegendaDasCores />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Rotulo htmlFor="cd-lev-nome">Nome do levantamento</Rotulo>
          <Input id="cd-lev-nome" value={lev.nome} maxLength={120} disabled={!podeEditar} onChange={(e) => setLev((l) => ({ ...l, nome: e.target.value }))} />
        </div>
        <BotaoAcoes itens={itensLev(lev)} onSelect={(i) => void acaoLevantamento(i)} rotulo={`Ações do levantamento ${lev.nome}`} className="size-8" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-56 flex-col gap-1">
          <Rotulo>Critério de iluminação</Rotulo>
          <Select
            value={criterio ?? SEM}
            disabled={!podeEditar}
            onValueChange={(v) => atualizar((c) => ({ ...c, criterioIluminacao: v && v !== SEM ? (v as CriterioIluminacao) : null }))}
          >
            <SelectTrigger className="w-full" aria-label="Critério de iluminação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              {CRITERIOS_ILUMINACAO.map((k) => (
                <SelectItem key={k} value={k}>
                  {ROTULO_CRITERIO[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {criterio === "lux" && (
          <div className="flex w-36 flex-col gap-1">
            <Rotulo>Pé-direito (m)</Rotulo>
            <CampoNumero rotulo="Pé-direito (m)" valor={conteudo.peDireitoM} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => atualizar((c) => ({ ...c, peDireitoM: v }))} />
          </div>
        )}
        {criterio !== null && (
          <>
            <div className="flex w-44 flex-col gap-1">
              <Rotulo>FP da iluminação</Rotulo>
              <CampoNumero rotulo="FP da iluminação (aplica a todos os ambientes)" valor={fps.iluminacao} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => setLev((l) => definirFp(l, "iluminacao", v))} />
            </div>
            <div className="flex w-44 flex-col gap-1">
              <Rotulo>FP das tomadas de uso geral</Rotulo>
              <CampoNumero rotulo="FP das tomadas de uso geral (aplica a todos os ambientes)" valor={fps.tug} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => setLev((l) => definirFp(l, "tug", v))} />
            </div>
          </>
        )}
        {criterio === "habitacao" && <p className="pb-2 text-xs text-muted-foreground">Em azul: mínimo sugerido pela área e pelo perímetro.</p>}
      </div>

      {criterio !== null && (
        <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {AVISO_EDICAO[criterio]}
        </p>
      )}

      {criterio === "lux" && <CatalogoLuminarias conteudo={conteudo} atualizar={atualizar} podeEditar={podeEditar} />}

      <div className="space-y-4">
        {lev.pavimentos.map((p, i) => (
          <PavimentoCard key={p.id} conteudo={conteudo} levantamento={lev} pavimento={p} indice={i} total={lev.pavimentos.length} atualizar={atualizar} podeEditar={podeEditar} />
        ))}
      </div>

      <ResumoDosLevantamentos conteudo={conteudo} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {podeEditar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className=""
            disabled={lev.pavimentos.length >= MAX_PAVIMENTOS}
            title={lev.pavimentos.length >= MAX_PAVIMENTOS ? MOTIVO_PAVIMENTOS_CHEIO : undefined}
            onClick={() => setLev((l) => ({ ...l, pavimentos: [...l.pavimentos, novoPavimento(`${l.pavimentos.length + 1}º pavimento`)] }))}
          >
            <Plus aria-hidden className="mr-1 size-3.5" /> Adicionar pavimento
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={onContinuar}>
          Continuar para Demandas <ChevronRight aria-hidden className="ml-1 size-4" />
        </Button>
      </div>
    </section>
  );
}

/** "Luminárias deste estudo" (L1, L2…): o catálogo de que os ambientes escolhem (critério de lux). */
function CatalogoLuminarias({ conteudo, atualizar, podeEditar }: PropsEtapa) {
  const confirm = useConfirm();
  const cheio = conteudo.luminarias.length >= MAX_LUMINARIAS;
  const mudar = (id: string, f: (l: (typeof conteudo.luminarias)[number]) => (typeof conteudo.luminarias)[number]) =>
    atualizar((c) => ({ ...c, luminarias: c.luminarias.map((l) => (l.id === id ? f(l) : l)) }));

  async function remover(id: string, codigo: string) {
    const usam = ambientesQueUsam(conteudo, id);
    const ok = await confirm({
      title: `Excluir a luminária ${codigo}?`,
      description: usam > 0 ? `${usam} ambiente(s) usam esta luminária e ficam sem luminária escolhida.` : undefined,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (ok) atualizar((c) => removerLuminaria(c, id));
  }

  return (
    <section aria-label="Luminárias deste estudo" className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Luminárias deste estudo</h3>
        {podeEditar && (
          <Button type="button" variant="ghost" size="sm" className="" disabled={cheio} onClick={() => atualizar((c) => ({ ...c, luminarias: [...c.luminarias, novaLuminaria(c.luminarias)] }))}>
            <Plus aria-hidden className="mr-1 size-3.5" /> Luminária
          </Button>
        )}
      </div>
      {conteudo.luminarias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cadastre as luminárias do catálogo do fabricante e escolha uma em cada ambiente.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Catálogo de luminárias</caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="w-16 px-1 pb-1 text-left font-medium">Código</th>
                <th className="px-1 pb-1 text-left font-medium">Descrição</th>
                <th className="w-28 px-1 pb-1 font-medium">Fluxo (lm)</th>
                <th className="w-28 px-1 pb-1 font-medium">Potência (W)</th>
                <th className="w-24 px-1 pb-1 font-medium">FP</th>
                <th className="w-10" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {conteudo.luminarias.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-1 py-1">
                    <Input aria-label="Código da luminária" value={l.codigo} maxLength={20} disabled={!podeEditar} onChange={(e) => mudar(l.id, (x) => ({ ...x, codigo: e.target.value }))} className="font-semibold" />
                  </td>
                  <td className="px-1 py-1">
                    <Input aria-label={`Descrição da luminária ${l.codigo}`} value={l.descricao} maxLength={120} disabled={!podeEditar} onChange={(e) => mudar(l.id, (x) => ({ ...x, descricao: e.target.value }))} />
                  </td>
                  <td className="px-1 py-1">
                    <CampoNumero rotulo={`Fluxo luminoso da luminária ${l.codigo} (lm)`} valor={l.fluxoLm} casas={0} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => mudar(l.id, (x) => ({ ...x, fluxoLm: v }))} />
                  </td>
                  <td className="px-1 py-1">
                    <CampoNumero rotulo={`Potência da luminária ${l.codigo} (W)`} valor={l.potenciaW} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => mudar(l.id, (x) => ({ ...x, potenciaW: v }))} />
                  </td>
                  <td className="px-1 py-1">
                    <CampoNumero rotulo={`FP da luminária ${l.codigo}`} valor={l.fp} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => mudar(l.id, (x) => ({ ...x, fp: v }))} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    {podeEditar && (
                      <Button type="button" variant="ghost" size="sm" aria-label={`Excluir a luminária ${l.codigo}`} onClick={() => void remover(l.id, l.codigo)}>
                        ×
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
