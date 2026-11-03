"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { LIGACOES } from "@/modules/ferramentas/calc/electrical-demand";
import { camposInvalidos, type Linha } from "@/modules/ferramentas/carga-linha";
import { Prop } from "./prop";

export { Prop };

/**
 * Uma linha de carga elétrica (descrição + potência, tensão, ligação, fp, rendimento e fator de
 * demanda), com menu de contexto e `...`. Compartilhada pela calculadora "Corrente e demanda" e pelo
 * Estudos: `extra` entra como mais uma célula da grade (o tipo do ponto, no Estudos).
 */
export function LinhaCarga({
  linha,
  numero,
  itens,
  onSelect,
  onChange,
  idPrefixo,
  contexto,
  extra,
}: {
  linha: Linha;
  numero: number;
  itens: AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
  onChange: (k: keyof Linha, v: string) => void;
  /** Prefixo dos ids dos campos; precisa ser único na tela (vários ambientes → um prefixo por ambiente). */
  idPrefixo: string;
  /** Onde a carga está (ex.: o ambiente): entra no nome acessível, porque os rótulos se repetem em cada ambiente. */
  contexto?: string;
  extra?: ReactNode;
}) {
  // Id pela posição, não pela `chave`: o contador da chave difere entre servidor e cliente (hidratação).
  const id = `${idPrefixo}-${numero}`;
  const invalidos = camposInvalidos(linha);
  const campo = (k: keyof Linha, rotulo: string, opc?: { step?: string }) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${k}`} className="text-xs">{rotulo}</Label>
      <Input
        id={`${id}-${k}`}
        type="number"
        step={opc?.step}
        value={linha[k] as string}
        aria-label={contexto ? `${rotulo} da carga ${numero} (${contexto})` : undefined}
        aria-invalid={invalidos.has(k) || undefined}
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
            maxLength={120}
            aria-label={contexto ? `Carga ${numero} (${contexto})` : undefined}
            placeholder="Ex.: chuveiro, iluminação da sala"
            onChange={(e) => onChange("descricao", e.target.value)}
          />
        </div>
        <BotaoAcoes itens={itens} onSelect={onSelect} rotulo={contexto ? `Ações da carga ${numero} (${contexto})` : `Ações da carga ${numero}`} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {campo("quantidade", "Qtd")}
        {campo("potenciaW", "P unit. (W)")}
        {campo("tensaoV", "Tensão (V)")}
        <div className="space-y-1">
          <Label className="text-xs">Ligação</Label>
          <Select value={linha.ligacao} onValueChange={(v) => v && onChange("ligacao", v)}>
            <SelectTrigger className="w-full" aria-label={contexto ? `Ligação da carga ${numero} (${contexto})` : `Ligação da carga ${numero}`}><SelectValue /></SelectTrigger>
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
        {extra}
      </div>
    </LinhaComMenu>
  );
}
