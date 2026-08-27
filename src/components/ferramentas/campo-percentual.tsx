"use client";

import { InputPercentual } from "@/components/ui/input-percentual";
import { Label } from "@/components/ui/label";

/**
 * Campo de percentual para os formulários de ferramentas.
 *
 * Existe porque cada form de ferramenta tem seu próprio `Campo` local, com assinatura
 * `value: string` — trocar o input lá dentro obrigaria a mudar a assinatura de oito
 * wrappers e converter todos os campos irmãos (fck, Fz, cota) junto. Este componente
 * espelha a marcação do `Campo` (mesmo `space-y-1.5`, mesmo `font-mono`) e é usado só
 * nos campos que são percentual de verdade, deixando o `Campo` local cuidando do resto.
 *
 * Escala 0–100, como todo percentual do sistema. Campo documentado como fração 0–1 NÃO
 * entra aqui — `pctAlivio` (`eccentric-footing`, `max(1)`) tem "pct" no nome e mesmo
 * assim é fração.
 */
export function CampoPercentual({
  id,
  label,
  value,
  onChange,
  decimais,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (valor: number | null) => void;
  /** Casas decimais. Padrão 2; use 3 para taxa de armadura (ρ ≈ 0,375%). */
  decimais?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <InputPercentual
        id={id}
        decimais={decimais}
        value={value}
        onChange={onChange}
        className="font-mono"
      />
    </div>
  );
}
