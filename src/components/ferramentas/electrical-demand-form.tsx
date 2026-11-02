"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import {
  calcular,
  ISOLACOES,
  LIGACOES,
  temperaturasDaTabela,
  type EntradaDemandaInput,
  type Isolacao,
} from "@/modules/ferramentas/calc/electrical-demand";
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
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

type Linha = {
  chave: number;
  descricao: string;
  quantidade: string;
  potenciaW: string;
  fp: string;
  rendimento: string;
  fdPct: string;
  tensaoV: string;
  ligacao: "mono" | "tri";
};

type Geral = {
  isolacao: Isolacao;
  temperaturaC: string;
  circuitos: string;
  fctManual: string;
  fcaManual: string;
  alimentacaoTensaoV: string;
  alimentacaoLigacao: "mono" | "tri";
};

const s = (v: unknown, d: string) => (v != null ? String(v) : d);
const num = (v: string) => Number(v.replace(",", "."));

let proximaChave = 1;
const novaLinha = (base?: Partial<Linha>): Linha => ({
  chave: proximaChave++,
  descricao: "",
  quantidade: "1",
  potenciaW: "",
  fp: "1",
  rendimento: "1",
  fdPct: "100",
  tensaoV: "127",
  ligacao: "mono",
  ...base,
});

function linhasIniciais(e?: Record<string, unknown>): Linha[] {
  const arr = e?.cargas;
  if (!Array.isArray(arr) || arr.length === 0) return [novaLinha()];
  return arr.map((c) => {
    const r = c as Record<string, unknown>;
    return novaLinha({
      descricao: s(r.descricao, ""),
      quantidade: s(r.quantidade, "1"),
      potenciaW: s(r.potenciaW, ""),
      fp: s(r.fp, "1"),
      rendimento: s(r.rendimento, "1"),
      fdPct: typeof r.fd === "number" ? String(Math.round(r.fd * 1000) / 10) : "100",
      tensaoV: s(r.tensaoV, "127"),
      ligacao: r.ligacao === "tri" ? "tri" : "mono",
    });
  });
}

function geralInicial(e?: Record<string, unknown>): Geral {
  return {
    isolacao: e?.isolacao === "EPR" ? "EPR" : "PVC",
    temperaturaC: s(e?.temperaturaC, "30"),
    circuitos: s(e?.circuitosAgrupados, "1"),
    fctManual: s(e?.fctManual, ""),
    fcaManual: s(e?.fcaManual, ""),
    alimentacaoTensaoV: s(e?.alimentacaoTensaoV, "220"),
    alimentacaoLigacao: e?.alimentacaoLigacao === "mono" ? "mono" : "tri",
  };
}

type Montagem = { entrada: EntradaDemandaInput; erro?: undefined } | { entrada?: undefined; erro: string };

/** Devolve a entrada ou a primeira coisa que falta (com o número da carga), para a tela orientar. */
function montarEntrada(linhas: Linha[], g: Geral): Montagem {
  const cargas = [];
  for (const [i, l] of linhas.entries()) {
    const nome = `Carga ${i + 1}`;
    const q = num(l.quantidade);
    if (!(Number.isInteger(q) && q > 0)) return { erro: `${nome}: a quantidade deve ser um número inteiro maior que zero.` };
    if (!(num(l.potenciaW) > 0)) return { erro: `${nome}: informe a potência unitária em W.` };
    if (!(num(l.tensaoV) > 0)) return { erro: `${nome}: informe a tensão em V.` };
    const fp = num(l.fp);
    const eta = num(l.rendimento);
    const fd = num(l.fdPct) / 100;
    if (!(fp > 0 && fp <= 1)) return { erro: `${nome}: o fator de potência vai de 0,01 a 1.` };
    if (!(eta > 0 && eta <= 1)) return { erro: `${nome}: o rendimento vai de 0,01 a 1.` };
    if (!(fd > 0 && fd <= 1)) return { erro: `${nome}: o fator de demanda vai de 1 % a 100 %.` };
    cargas.push({
      descricao: l.descricao.trim() || nome,
      quantidade: q,
      potenciaW: num(l.potenciaW),
      fp,
      rendimento: eta,
      fd,
      tensaoV: num(l.tensaoV),
      ligacao: l.ligacao,
    });
  }
  const circuitos = num(g.circuitos);
  if (!(Number.isInteger(circuitos) && circuitos > 0)) return { erro: "Circuitos agrupados: informe um número inteiro maior que zero." };
  if (!(num(g.alimentacaoTensaoV) > 0)) return { erro: "Alimentação geral: informe a tensão em V." };
  const e: EntradaDemandaInput = {
    cargas,
    isolacao: g.isolacao,
    temperaturaC: num(g.temperaturaC),
    circuitosAgrupados: circuitos,
    alimentacaoTensaoV: num(g.alimentacaoTensaoV),
    alimentacaoLigacao: g.alimentacaoLigacao,
  };
  if (g.fctManual.trim() !== "") {
    if (!(num(g.fctManual) > 0 && num(g.fctManual) <= 1.5)) return { erro: "FCT manual: use um valor entre 0 e 1,5." };
    e.fctManual = num(g.fctManual);
  }
  if (g.fcaManual.trim() !== "") {
    if (!(num(g.fcaManual) > 0 && num(g.fcaManual) <= 1)) return { erro: "FCA manual: use um valor entre 0 e 1." };
    e.fcaManual = num(g.fcaManual);
  }
  return { entrada: e };
}

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
  const setG = <K extends keyof Geral>(k: K, v: Geral[K]) => setGeral((g) => ({ ...g, [k]: v }));

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
        const copia = { ...a[indice], chave: nova.chave, descricao: a[indice].descricao ? `${a[indice].descricao} (cópia)` : "" };
        return [...a.slice(0, indice + 1), copia, ...a.slice(indice + 1)];
      }
      if (item.id === ACAO_CARGA_SUBIR) return moverItem(a, indice, indice - 1);
      if (item.id === ACAO_CARGA_DESCER) return moverItem(a, indice, indice + 1);
      if (item.id === ACAO_CARGA_REMOVER) return a.length > 1 ? a.filter((l) => l.chave !== chave) : a;
      return a;
    });
  }

  const temperaturas = temperaturasDaTabela(geral.isolacao);
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium">2. Condições de instalação (fatores de correção)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Isolação</Label>
            <Select
              value={geral.isolacao}
              onValueChange={(v) => {
                if (!v) return;
                const iso = v as Isolacao;
                setGeral((g) => ({
                  ...g,
                  isolacao: iso,
                  temperaturaC: temperaturasDaTabela(iso).includes(num(g.temperaturaC)) ? g.temperaturaC : "30",
                }));
              }}
            >
              <SelectTrigger aria-label="Isolação dos condutores"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ISOLACOES) as Isolacao[]).map((k) => (
                  <SelectItem key={k} value={k}>{ISOLACOES[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Temperatura ambiente</Label>
            <Select value={geral.temperaturaC} onValueChange={(v) => v && setG("temperaturaC", v)}>
              <SelectTrigger aria-label="Temperatura ambiente"><SelectValue /></SelectTrigger>
              <SelectContent>
                {temperaturas.map((t) => (
                  <SelectItem key={t} value={String(t)}>{t} °C</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e01-circ">Circuitos agrupados</Label>
            <Input id="e01-circ" type="number" min={1} value={geral.circuitos} onChange={(e) => setG("circuitos", e.target.value)} className="font-mono" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e01-fct">FCT manual (opcional)</Label>
            <Input id="e01-fct" type="number" step="0.01" value={geral.fctManual} onChange={(e) => setG("fctManual", e.target.value)} className="font-mono" placeholder="tabela" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e01-fca">FCA manual (opcional)</Label>
            <Input id="e01-fca" type="number" step="0.01" value={geral.fcaManual} onChange={(e) => setG("fcaManual", e.target.value)} className="font-mono" placeholder="tabela" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          FCT: Tabela 40 da NBR 5410 (base 30 °C). FCA: Tabela 42, condutores em feixe ou em conduto fechado. Outro método de instalação? Informe os fatores à mão.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">3. Alimentação geral</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Ligação</Label>
            <Select value={geral.alimentacaoLigacao} onValueChange={(v) => v && setG("alimentacaoLigacao", v as "mono" | "tri")}>
              <SelectTrigger aria-label="Ligação da alimentação geral"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mono">Monofásica</SelectItem>
                <SelectItem value="tri">Trifásica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e01-vali">Tensão (V)</Label>
            <Input id="e01-vali" type="number" value={geral.alimentacaoTensaoV} onChange={(e) => setG("alimentacaoTensaoV", e.target.value)} className="font-mono" />
          </div>
        </div>
      </section>

      {!resultado && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
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
            <p key={a} className="text-xs text-warning">{a}</p>
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

function LinhaCarga({
  linha,
  numero,
  itens,
  onSelect,
  onChange,
}: {
  linha: Linha;
  numero: number;
  itens: ReturnType<typeof itensDeCarga>;
  onSelect: (item: AcaoItemAcao) => void;
  onChange: (k: keyof Linha, v: string) => void;
}) {
  // Id pela posição, não pela `chave`: o contador da chave difere entre servidor e cliente (hidratação).
  const id = `e01-${numero}`;
  const campo = (k: keyof Linha, rotulo: string, extra?: { step?: string }) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${k}`} className="text-xs">{rotulo}</Label>
      <Input
        id={`${id}-${k}`}
        type="number"
        step={extra?.step}
        value={linha[k] as string}
        onChange={(e) => onChange(k, e.target.value)}
        className="font-mono"
      />
    </div>
  );

  return (
    <LinhaComMenu itens={itens} onSelect={onSelect} render={<div className="group rounded-md border bg-background p-3 space-y-2" />}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`${id}-descricao`} className="text-xs">Carga {numero}</Label>
          <Input
            id={`${id}-descricao`}
            value={linha.descricao}
            placeholder="Ex.: chuveiro, iluminação da sala"
            onChange={(e) => onChange("descricao", e.target.value)}
          />
        </div>
        <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={`Ações da carga ${numero}`} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {campo("quantidade", "Qtd")}
        {campo("potenciaW", "P unit. (W)")}
        {campo("tensaoV", "Tensão (V)")}
        <div className="space-y-1">
          <Label className="text-xs">Ligação</Label>
          <Select value={linha.ligacao} onValueChange={(v) => v && onChange("ligacao", v)}>
            <SelectTrigger aria-label={`Ligação da carga ${numero}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(LIGACOES) as (keyof typeof LIGACOES)[]).map((k) => (
                <SelectItem key={k} value={k}>{k === "mono" ? "Monofásica" : "Trifásica"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {campo("fp", "Fator de potência", { step: "0.01" })}
        {campo("rendimento", "Rendimento (η)", { step: "0.01" })}
        {campo("fdPct", "Fator de demanda (%)")}
      </div>
    </LinhaComMenu>
  );
}

function Prop({ simbolo, valor, un, destaque }: { simbolo: string; valor: string; un: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="italic text-muted-foreground">{simbolo} =</span>
      <span className={`font-mono ${destaque ? "font-semibold" : "font-medium"}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{un}</span>
    </div>
  );
}
