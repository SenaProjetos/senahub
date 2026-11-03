"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DIAMETROS_PVC, type DimensionamentoMotor, type TrechoResultado } from "@/modules/ferramentas/calc/hidraulica";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Prop } from "./prop";

export { Prop };

/** Texto do formulário → número (aceita vírgula). Vazio dá NaN, que nunca passa em `> 0`. */
export const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

/** Campo que falta ou está fora da faixa: o `id` é o do input; `valor` é o que a pessoa digitou. */
export type Pendencia = { id: string; texto: string; valor: string };
export const pend = (id: string, valor: string, texto: string): Pendencia => ({ id, texto, valor });
export const textoDasPendencias = (falta: Pendencia[]) => falta.map((f) => f.texto).join(", ");
/** Só campo JÁ digitado e errado é `aria-invalid`: o formulário vazio não nasce todo marcado como inválido. */
export const invalidosDigitados = (falta: Pendencia[]) => new Set(falta.filter((f) => f.valor.trim() !== "").map((f) => f.id));

export const texto = (v: unknown, padrao: string) => (v != null ? String(v) : padrao);
export const percentual = (v: unknown, padrao: string) =>
  typeof v === "number" ? String(Math.round(v * 1000) / 10) : padrao;

/** Sem DN digitado, o cálculo adota o sugerido: o valor "auto" do seletor. */
export function SelectDn({
  id,
  rotulo,
  valor,
  onChange,
  adotado,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  /** DN que o cálculo adotou (mostrado no item "Automático"). */
  adotado: number | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={valor} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-full" id={id} aria-label={rotulo}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{adotado != null ? `Automático (DN${adotado})` : "Automático"}</SelectItem>
          {DIAMETROS_PVC.map((d) => (
            <SelectItem key={d.dn} value={String(d.dn)}>
              DN{d.dn} ({d.polegadas}) — interno {fmtNum(d.internoMm, 1)} mm
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}


export function BlocoTrecho({ nome, t, automatico }: { nome: string; t: TrechoResultado; automatico: boolean }) {
  return (
    <div className="rounded-md border bg-background p-3 space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{nome}</h3>
      <p className="font-mono text-base font-semibold">
        DN{t.dn} <span className="text-xs font-normal text-muted-foreground">({t.polegadas}{automatico ? ", adotado pelo cálculo" : ""})</span>
      </p>
      <p className="text-xs text-muted-foreground">
        v = {fmtNum(t.velocidadeMs, 2)} m/s · J = {fmtNum(t.perdaUnitaria, 4)} m/m
      </p>
      <p className="text-xs text-muted-foreground">
        L + Leq = {fmtNum(t.comprimentoTotalM, 1)} m · hf = {fmtNum(t.perdaMca, 2)} mca
      </p>
    </div>
  );
}

export function BlocoMotor({ m }: { m: DimensionamentoMotor }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
      <Prop simbolo="P" valor={fmtNum(m.potenciaCv, 2)} un="cv" />
      <Prop simbolo={`P + ${fmtNum(m.margem * 100, 0)} %`} valor={fmtNum(m.comMargemCv, 2)} un="cv" />
      <Prop simbolo="Motor" valor={m.motorCv != null ? fmtNum(m.motorCv, 2) : "nenhum motor da tabela atende"} un={m.motorCv != null ? "cv" : ""} destaque />
    </div>
  );
}
