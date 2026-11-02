"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { calcular } from "@/modules/ferramentas/calc/electrical-demand";
import {
  ACAO_CARGA_DESCER,
  ACAO_CARGA_DUPLICAR,
  ACAO_CARGA_REMOVER,
  ACAO_CARGA_SUBIR,
  MAX_CARGAS,
  MOTIVO_LISTA_CHEIA,
  itensDeCarga,
  moverItem,
} from "@/modules/ferramentas/acoes-carga";
import { geralInicial, linhasIniciais, montarEntrada, novaLinha, type Geral, type Linha } from "@/modules/ferramentas/carga-linha";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { CondicoesInstalacao } from "./condicoes-instalacao";
import { LinhaCarga, Prop } from "./linha-carga";
import { AlertaCalculo } from "./alerta-calculo";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

export function ElectricalDemandForm({ initialEntradas, onSalvo }: Props) {
  const confirm = useConfirm();
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(initialEntradas));
  const [geral, setGeral] = useState<Geral>(() => geralInicial(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  const montagem = useMemo(() => montarEntrada(linhas, geral), [linhas, geral]);
  const entrada = montagem.entrada ?? null;
  const { resultado, erroCalculo } = useMemo(() => {
    if (!entrada) return { resultado: null, erroCalculo: null };
    try {
      return { resultado: calcular(entrada), erroCalculo: null };
    } catch (e) {
      const msg = e instanceof ZodError ? e.issues[0]?.message : null;
      return { resultado: null, erroCalculo: msg ?? "Não foi possível calcular com estes dados." };
    }
  }, [entrada]);
  const orientacao = montagem.erro ?? erroCalculo;

  const setLinha = (chave: number, k: keyof Linha, v: string) =>
    setLinhas((a) => a.map((l) => (l.chave === chave ? { ...l, [k]: v } : l)));

  async function executar(chave: number, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    // Chave nova criada fora do updater (StrictMode roda o updater duas vezes).
    const nova = novaLinha();
    // A linha é achada pela chave DEPOIS da confirmação: a lista pode ter mudado com o diálogo aberto.
    setLinhas((a) => {
      const indice = a.findIndex((l) => l.chave === chave);
      if (indice < 0) return a;
      if (item.id === ACAO_CARGA_DUPLICAR) {
        const copia = { ...a[indice], chave: nova.chave, descricao: a[indice].descricao ? `${a[indice].descricao.slice(0, 112)} (cópia)` : "" };
        return [...a.slice(0, indice + 1), copia, ...a.slice(indice + 1)];
      }
      if (item.id === ACAO_CARGA_SUBIR) return moverItem(a, indice, indice - 1);
      if (item.id === ACAO_CARGA_DESCER) return moverItem(a, indice, indice + 1);
      if (item.id === ACAO_CARGA_REMOVER) return a.length > 1 ? a.filter((l) => l.chave !== chave) : a;
      return a;
    });
  }

  const total = linhas.length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">1. Cargas</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={total >= MAX_CARGAS}
            onClick={() => setLinhas((a) => [...a, novaLinha()])}
          >
            <Plus aria-hidden className="h-3.5 w-3.5 mr-1.5" /> Adicionar carga
          </Button>
          {total >= MAX_CARGAS && <span className="text-xs text-muted-foreground">{MOTIVO_LISTA_CHEIA}</span>}
        </div>
        <ul className="space-y-2" aria-label="Cargas da instalação">
          {linhas.map((l, i) => {
            const itens = itensDeCarga({ indice: i, total });
            return (
              <li key={l.chave}>
                <LinhaCarga
                  linha={l}
                  numero={i + 1}
                  itens={itens}
                  idPrefixo="e01"
                  onSelect={(item) => void executar(l.chave, item)}
                  onChange={(k, v) => setLinha(l.chave, k, v)}
                />
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Potência nominal em W (de saída, no caso de motores). Fator de demanda: use o da concessionária; 100 % se a carga funciona toda junta.
          Clique com o botão direito numa carga (ou use o ⋯) para duplicar, mover ou remover.
        </p>
      </section>

      <CondicoesInstalacao geral={geral} onChange={setGeral} idPrefixo="e01" numeracao={2} />

      {!resultado && (
        <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {orientacao}
        </p>
      )}

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-4 text-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Corrente e demanda por carga</caption>
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="font-medium pb-1 pr-3">Carga</th>
                  <th className="font-medium pb-1 pr-3 text-right">Ib (A)</th>
                  <th className="font-medium pb-1 pr-3 text-right">Ib′ (A)</th>
                  <th className="font-medium pb-1 text-right">Demanda (W)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {resultado.linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="pr-3 font-sans">{l.descricao}</td>
                    <td className="pr-3 text-right">{fmtNum(l.ib, 2)}</td>
                    <td className="pr-3 text-right">{fmtNum(l.ibCorrigida, 2)}</td>
                    <td className="text-right">{fmtNum(l.pDemandada, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 border-t pt-3">
            <Prop simbolo="FCT" valor={fmtNum(resultado.fct, 2)} un="" />
            <Prop simbolo="FCA" valor={fmtNum(resultado.fca, 2)} un="" />
            <Prop simbolo="P instalada" valor={fmtNum(resultado.pInstaladaW / 1000, 2)} un="kW" />
            <Prop simbolo="Demanda" valor={fmtNum(resultado.pDemandadaW / 1000, 2)} un="kW" destaque />
            <Prop simbolo="Demanda" valor={fmtNum(resultado.sDemandadaVA / 1000, 2)} un="kVA" destaque />
            <Prop simbolo="fp médio" valor={fmtNum(resultado.fpMedio, 2)} un="" />
            <Prop simbolo="I total" valor={fmtNum(resultado.correnteTotalA, 1)} un="A" destaque />
          </div>
          {resultado.alertas.map((a) => (
            <AlertaCalculo key={a}>{a}</AlertaCalculo>
          ))}
        </div>
      )}

      <Footer
        ferramenta="corrente-demanda"
        titulo={`Corrente e demanda — ${total} carga${total > 1 ? "s" : ""}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setLinhas(linhasIniciais(n));
          setGeral(geralInicial(n));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}
