"use client";

import { useId, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISOLACOES, temperaturasDaTabela, type Isolacao } from "@/modules/ferramentas/calc/electrical-demand";
import { num, type FatorDaTela, type Geral } from "@/modules/ferramentas/carga-linha";
import { cn } from "@/lib/utils";
import { NumBadge } from "./guia/guia-ferramenta";
import { Segmentado } from "./segmentado";
import { fmtTela } from "./tabela-cargas";

const OPCOES_ISOLACAO = (Object.keys(ISOLACOES) as Isolacao[]).map((k) => ({ valor: k, rotulo: ISOLACOES[k], titulo: ISOLACOES[k] }));
const OPCOES_LIGACAO = [
  { valor: "mono", rotulo: "Monofásica" },
  { valor: "tri", rotulo: "Trifásica" },
] as const;

/** Cabeçalho dos cards numerados da calculadora (o número casa com o grupo do guia "Como preencher"). */
export function CabecalhoCartao({ n, titulo, children }: { n?: number; titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
      <h2 className="flex items-center gap-2.5 text-sm font-bold">
        {n != null && <NumBadge n={n} />}
        {titulo}
      </h2>
      {children}
    </div>
  );
}

/** Valor calculado à vista (fundo cinza = calculado, como na tabela). */
export function Leitura({ rotulo, valor, detalhe, className }: { rotulo: string; valor: string; detalhe?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-sm border border-border/60 bg-muted/40 px-3 py-2", className)}>
      <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{rotulo}</p>
      <p className="font-mono text-lg font-extrabold tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

const CAMPO = "h-8 rounded-sm font-mono tabular-nums";

/**
 * Condições de instalação da calculadora larga: isolação, temperatura e circuitos, com o FCT e o FCA em
 * vigor à vista. Os fatores à mão só aparecem quando a pessoa pede; desmarcar apaga o que foi digitado,
 * senão um fator escondido continuaria valendo. `@container`: no card estreito (três cards por linha) os
 * campos ficam dois a dois; largo, quatro por linha.
 */
export function CartaoCondicoes({
  geral,
  onChange,
  fatores,
  idPrefixo,
  numero,
  titulo,
}: {
  geral: Geral;
  onChange: (proximo: Geral) => void;
  fatores: { fct: FatorDaTela; fca: FatorDaTela };
  idPrefixo: string;
  numero: number;
  titulo: string;
}) {
  const idIsolacao = useId();
  const [manual, setManual] = useState(() => geral.fctManual.trim() !== "" || geral.fcaManual.trim() !== "");
  const setG = <K extends keyof Geral>(k: K, v: Geral[K]) => onChange({ ...geral, [k]: v });
  const temperaturas = temperaturasDaTabela(geral.isolacao);
  const circuitos = num(geral.circuitos);

  function trocarIsolacao(iso: Isolacao) {
    onChange({
      ...geral,
      isolacao: iso,
      temperaturaC: temperaturasDaTabela(iso).includes(num(geral.temperaturaC)) ? geral.temperaturaC : "30",
    });
  }

  function trocarManual(ligado: boolean) {
    setManual(ligado);
    if (!ligado) onChange({ ...geral, fctManual: "", fcaManual: "" });
  }

  return (
    <Card className="@container gap-0 py-0">
      <CabecalhoCartao n={numero} titulo={titulo} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 items-end gap-3 @xl:grid-cols-4">
          <div className="col-span-2 space-y-1.5">
            <Label id={idIsolacao}>Isolação</Label>
            <Segmentado opcoes={OPCOES_ISOLACAO} valor={geral.isolacao} onChange={trocarIsolacao} rotuladoPor={idIsolacao} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${idPrefixo}-temp`}>Temperatura ambiente</Label>
            <Select value={geral.temperaturaC} onValueChange={(v) => v && setG("temperaturaC", v)}>
              <SelectTrigger id={`${idPrefixo}-temp`} className="h-8 w-full rounded-sm font-mono" aria-label="Temperatura ambiente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {temperaturas.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {t} °C
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${idPrefixo}-circ`}>Circuitos agrupados</Label>
            <Input
              id={`${idPrefixo}-circ`}
              type="number"
              min={1}
              value={geral.circuitos}
              onChange={(e) => setG("circuitos", e.target.value)}
              aria-invalid={!(Number.isInteger(circuitos) && circuitos > 0) || undefined}
              className={CAMPO}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3 @xl:grid-cols-4">
          <Leitura
            rotulo="FCT"
            valor={fmtTela(fatores.fct.valor, 2)}
            detalhe={fatores.fct.manual ? "Informado à mão" : fatores.fct.valor == null ? "Fora da tabela: informe à mão" : `Da tabela, ${geral.temperaturaC} °C`}
          />
          <Leitura
            rotulo="FCA"
            valor={fmtTela(fatores.fca.valor, 2)}
            detalhe={
              fatores.fca.manual
                ? "Informado à mão"
                : fatores.fca.valor == null
                  ? "Digite os circuitos"
                  : `Da tabela, ${circuitos} ${circuitos === 1 ? "circuito" : "circuitos"}`
            }
          />
          {manual && (
            <>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${idPrefixo}-fct`}>FCT manual</Label>
                <Input
                  id={`${idPrefixo}-fct`}
                  type="number"
                  step="0.01"
                  value={geral.fctManual}
                  placeholder={fatores.fct.manual ? undefined : fmtTela(fatores.fct.valor, 2)}
                  onChange={(e) => setG("fctManual", e.target.value)}
                  className={CAMPO}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${idPrefixo}-fca`}>FCA manual</Label>
                <Input
                  id={`${idPrefixo}-fca`}
                  type="number"
                  step="0.01"
                  value={geral.fcaManual}
                  placeholder={fatores.fca.manual ? undefined : fmtTela(fatores.fca.valor, 2)}
                  onChange={(e) => setG("fcaManual", e.target.value)}
                  className={CAMPO}
                />
              </div>
            </>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={manual} onCheckedChange={(v) => trocarManual(v === true)} className="mt-0.5" />
          <span>
            Informar FCT e FCA à mão
            <span className="block text-xs text-muted-foreground">Para outro método de instalação. Em branco, vale o da tabela.</span>
          </span>
        </label>
      </div>
    </Card>
  );
}

/** Alimentação geral: ligação e tensão, com a corrente total da demanda à vista. */
export function CartaoAlimentacao({
  geral,
  onChange,
  correnteTotalA,
  idPrefixo,
  numero,
  titulo,
}: {
  geral: Geral;
  onChange: (proximo: Geral) => void;
  correnteTotalA: number | null;
  idPrefixo: string;
  numero: number;
  titulo: string;
}) {
  const idLigacao = useId();
  const tensao = num(geral.alimentacaoTensaoV);
  return (
    <Card className="gap-0 py-0">
      <CabecalhoCartao n={numero} titulo={titulo} />
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label id={idLigacao}>Ligação</Label>
          <Segmentado
            opcoes={OPCOES_LIGACAO}
            valor={geral.alimentacaoLigacao}
            onChange={(v) => onChange({ ...geral, alimentacaoLigacao: v })}
            rotuladoPor={idLigacao}
          />
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${idPrefixo}-vali`}>Tensão (V)</Label>
            <Input
              id={`${idPrefixo}-vali`}
              type="number"
              value={geral.alimentacaoTensaoV}
              onChange={(e) => onChange({ ...geral, alimentacaoTensaoV: e.target.value })}
              aria-invalid={!(tensao > 0) || undefined}
              className={CAMPO}
            />
          </div>
          <Leitura rotulo="Corrente total" valor={correnteTotalA == null ? "—" : `${fmtTela(correnteTotalA, 1)} A`} />
        </div>
      </div>
    </Card>
  );
}
