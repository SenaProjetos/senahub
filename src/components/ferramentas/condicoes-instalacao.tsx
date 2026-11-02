"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISOLACOES, temperaturasDaTabela, type Isolacao } from "@/modules/ferramentas/calc/electrical-demand";
import { num, type Geral } from "@/modules/ferramentas/carga-linha";

/**
 * Condições de instalação (fatores de correção) e alimentação geral — as mesmas telas da calculadora
 * "Corrente e demanda" e do Estudos. `numeracao` = número do primeiro título (a calculadora numera as
 * seções; no Estudos os títulos vão sem número).
 */
export function CondicoesInstalacao({
  geral,
  onChange,
  idPrefixo,
  numeracao,
}: {
  geral: Geral;
  onChange: (proximo: Geral) => void;
  idPrefixo: string;
  numeracao?: number;
}) {
  const setG = <K extends keyof Geral>(k: K, v: Geral[K]) => onChange({ ...geral, [k]: v });
  const temperaturas = temperaturasDaTabela(geral.isolacao);
  const titulo = (offset: number, texto: string) => (numeracao != null ? `${numeracao + offset}. ${texto}` : texto);

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{titulo(0, "Condições de instalação (fatores de correção)")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Isolação</Label>
            <Select
              value={geral.isolacao}
              onValueChange={(v) => {
                if (!v) return;
                const iso = v as Isolacao;
                onChange({
                  ...geral,
                  isolacao: iso,
                  temperaturaC: temperaturasDaTabela(iso).includes(num(geral.temperaturaC)) ? geral.temperaturaC : "30",
                });
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
            <Label htmlFor={`${idPrefixo}-circ`}>Circuitos agrupados</Label>
            <Input id={`${idPrefixo}-circ`} type="number" min={1} value={geral.circuitos} onChange={(e) => setG("circuitos", e.target.value)} className="font-mono" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefixo}-fct`}>FCT manual (opcional)</Label>
            <Input id={`${idPrefixo}-fct`} type="number" step="0.01" value={geral.fctManual} onChange={(e) => setG("fctManual", e.target.value)} className="font-mono" placeholder="tabela" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefixo}-fca`}>FCA manual (opcional)</Label>
            <Input id={`${idPrefixo}-fca`} type="number" step="0.01" value={geral.fcaManual} onChange={(e) => setG("fcaManual", e.target.value)} className="font-mono" placeholder="tabela" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          FCT: Tabela 40 da NBR 5410 (base 30 °C). FCA: Tabela 42, condutores em feixe ou em conduto fechado. Outro método de instalação? Informe os fatores à mão.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{titulo(1, "Alimentação geral")}</h2>
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
            <Label htmlFor={`${idPrefixo}-vali`}>Tensão (V)</Label>
            <Input id={`${idPrefixo}-vali`} type="number" value={geral.alimentacaoTensaoV} onChange={(e) => setG("alimentacaoTensaoV", e.target.value)} className="font-mono" />
          </div>
        </div>
      </section>
    </>
  );
}
