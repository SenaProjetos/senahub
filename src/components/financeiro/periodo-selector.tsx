"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Periodo = "mes" | "trimestre" | "ano";

const OPCOES: { valor: Periodo; rotulo: string }[] = [
  { valor: "mes", rotulo: "Mês corrente" },
  { valor: "trimestre", rotulo: "Trimestre" },
  { valor: "ano", rotulo: "Ano" },
];

/** Seletor do período do dashboard financeiro. Persiste a escolha em ?periodo=. */
export function PeriodoSelector({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  return (
    <Select
      value={periodo}
      onValueChange={(v) => router.push(`/financeiro?periodo=${v ?? "mes"}`)}
    >
      <SelectTrigger className="w-40" aria-label="Período do dashboard">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPCOES.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
