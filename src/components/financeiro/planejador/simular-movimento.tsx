"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { brlC } from "@/components/financeiro/planejador/formato";
import type { MovimentoSimulado } from "@/modules/financeiro/liquidez/simulacao";
import type { DataIso } from "@/modules/financeiro/liquidez/tipos";
import { cn } from "@/lib/utils";

type Tipo = "distribuicao" | "entrada" | "saida";

const TIPOS: { id: Tipo; rotulo: string; descricao: string }[] = [
  { id: "distribuicao", rotulo: "Distribuição de lucros", descricao: "Distribuição de lucros" },
  { id: "entrada", rotulo: "Entrada", descricao: "Entrada simulada" },
  { id: "saida", rotulo: "Saída", descricao: "Saída simulada" },
];

export function movimentoDoFormulario(tipo: Tipo, valorReais: number, data: DataIso, descricao: string): MovimentoSimulado {
  return {
    tipo: tipo === "entrada" ? "receita" : "despesa",
    natureza: tipo === "distribuicao" ? "fora_do_resultado" : "resultado",
    valor: Math.round(valorReais * 100),
    data,
    descricao: descricao.trim() || TIPOS.find((t) => t.id === tipo)!.descricao,
  };
}

/**
 * "Simular movimento" (mockup): entrada, saída ou distribuição de lucros que só existe na simulação.
 * Mostra a consequência ANTES de incluir — o planejador não impede, informa.
 */
export function SimularMovimento({
  aberto,
  hoje,
  fim,
  reservaMinima,
  previa,
  onFechar,
  onIncluir,
}: {
  aberto: boolean;
  hoje: DataIso;
  fim: DataIso;
  reservaMinima: number;
  /** Projeção com o movimento: saldo do dia antes/depois e o menor saldo resultante. */
  previa: (m: MovimentoSimulado) => { saldoDiaAntes: number; saldoDiaDepois: number; menorSaldo: number; diaMenor: DataIso };
  onFechar: () => void;
  onIncluir: (m: MovimentoSimulado) => void;
}) {
  const [tipo, setTipo] = useState<Tipo>("distribuicao");
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState<DataIso>(hoje);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (aberto) {
      setTipo("distribuicao");
      setValor(null);
      setData(hoje);
      setDescricao("");
    }
  }, [aberto, hoje]);

  const valido = valor !== null && valor > 0 && data >= hoje && data <= fim;
  const mov = valido ? movimentoDoFormulario(tipo, valor!, data, descricao) : null;
  const p = mov ? previa(mov) : null;
  const situacao = !p
    ? null
    : p.menorSaldo < 0
      ? { texto: `Déficit de ${brlC(-p.menorSaldo)} em ${p.diaMenor.slice(8, 10)}/${p.diaMenor.slice(5, 7)}`, classe: "text-destructive" }
      : p.menorSaldo < reservaMinima
        ? { texto: `${brlC(reservaMinima - p.menorSaldo)} abaixo da reserva em ${p.diaMenor.slice(8, 10)}/${p.diaMenor.slice(5, 7)}`, classe: "text-warning" }
        : { texto: "Dentro da reserva em todo o horizonte", classe: "text-success" };

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg">Simular movimento</SheetTitle>
          <SheetDescription>Só existe nesta simulação. Nada é lançado no financeiro.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div role="group" aria-label="Tipo de movimento" className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <Button key={t.id} size="sm" variant={tipo === t.id ? "default" : "outline"} aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.rotulo}
              </Button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sm-descricao">Descrição</Label>
            <Input id="sm-descricao" value={descricao} maxLength={200} placeholder={TIPOS.find((t) => t.id === tipo)!.descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sm-valor">Valor</Label>
            <InputMoeda id="sm-valor" value={valor} onChange={setValor} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sm-data">Data</Label>
            <Input id="sm-data" type="date" min={hoje} max={fim} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          {tipo === "distribuicao" && (
            <p className="rounded-sm border p-3 text-[13px] text-muted-foreground">Sai do caixa e fica fora do resultado: não é despesa na DRE.</p>
          )}
          {p && situacao && (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-sm border p-3 text-[13px]">
              <dt>Saldo no dia, antes</dt>
              <dd className="text-right font-mono">{brlC(p.saldoDiaAntes)}</dd>
              <dt>Saldo no dia, depois</dt>
              <dd className="text-right font-mono">{brlC(p.saldoDiaDepois)}</dd>
              <dt>Reserva mínima</dt>
              <dd className="text-right font-mono">{brlC(reservaMinima)}</dd>
              <dt className="font-bold">Situação</dt>
              <dd className={cn("text-right font-bold", situacao.classe)}>{situacao.texto}</dd>
            </dl>
          )}
          <p className="text-xs text-muted-foreground">O planejador não impede: mostra a consequência para você decidir.</p>
        </div>
        <SheetFooter className="flex-row">
          <Button disabled={!mov} onClick={() => mov && onIncluir(mov)}>
            Incluir na simulação
          </Button>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
