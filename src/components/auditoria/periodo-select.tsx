"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPCOES = [7, 14, 30, 90];

/** Seletor de janela de análise (?dias=). */
export function PeriodoSelect({ dias }: { dias: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function set(v: string | null) {
    if (!v) return;
    const params = new URLSearchParams(sp);
    params.set("dias", v);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={String(dias)} onValueChange={set}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPCOES.map((o) => (
          <SelectItem key={o} value={String(o)}>
            Últimos {o} dias
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
