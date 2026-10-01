"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OpcaoPeriodo<M extends string> = {
  valor: M;
  rotulo: string;
  /** Se definido, o modo tem navegação ◀ ▶ deslocando a referência esse tanto de meses. */
  passoMeses?: number;
};

/** Meia-noite local do dia (as telas guardam a referência do período assim). */
function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Seletor de período do Financeiro (lista de modos + navegação ◀ ▶ + De/Até). Existia em duas
 * cópias (contas a pagar/receber e livro caixa) que só diferiam nos modos oferecidos — agora o
 * que muda é a lista `opcoes`. Os botões ◀ ▶ têm nome acessível.
 */
export function SeletorPeriodo<M extends string>({
  opcoes,
  modo,
  onModo,
  referencia,
  onReferencia,
  rotuloDaReferencia,
  de,
  onDe,
  ate,
  onAte,
  modoPersonalizado = "custom" as M,
}: {
  opcoes: readonly OpcaoPeriodo<M>[];
  modo: M;
  onModo: (m: M) => void;
  referencia: Date;
  onReferencia: (d: Date) => void;
  /** Texto entre as setas ("set 2026", "jan - jun 2026"), pelo modo atual. */
  rotuloDaReferencia: (modo: M, referencia: Date) => string;
  de: string;
  onDe: (s: string) => void;
  ate: string;
  onAte: (s: string) => void;
  modoPersonalizado?: M;
}) {
  const atual = opcoes.find((o) => o.valor === modo);
  const passo = atual?.passoMeses;

  function deslocar(sinal: 1 | -1) {
    if (!passo) return;
    const d = new Date(referencia);
    d.setMonth(d.getMonth() + sinal * passo);
    onReferencia(inicioDoDia(d));
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        {passo ? (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" aria-label="Período anterior" onClick={() => deslocar(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="text-sm font-medium" aria-live="polite">
              {rotuloDaReferencia(modo, referencia)}
            </span>
            <Button variant="ghost" size="icon" aria-label="Próximo período" onClick={() => deslocar(1)}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
        <Select value={modo} onValueChange={(v) => onModo((v ?? opcoes[0].valor) as M)}>
          <SelectTrigger className="w-full" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modo === modoPersonalizado && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="periodo-de">De</Label>
              <Input id="periodo-de" type="date" value={de} onChange={(e) => onDe(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="periodo-ate">Até</Label>
              <Input id="periodo-ate" type="date" value={ate} onChange={(e) => onAte(e.target.value)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
