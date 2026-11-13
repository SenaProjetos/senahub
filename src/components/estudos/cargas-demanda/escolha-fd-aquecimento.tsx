"use client";

import { CRITERIOS_FD_AQUECIMENTO, type CalculoEstudo, type CriterioFdAquecimento } from "@/modules/estudos/cargas-demanda/conteudo";

import { Rotulo } from "./campos";

const OPCOES: Record<CriterioFdAquecimento, { titulo: string; texto: string; recomendado?: boolean }> = {
  potencia: {
    titulo: "Por potência do aparelho",
    texto: "Até 3,5 kW ou acima, pelo número de aparelhos. Vale para os grupos b1 a b5.",
    recomendado: true,
  },
  equipamento: {
    titulo: "Por tipo de equipamento",
    texto: "Chuveiro, torneira e aquecedor, fogão, forno e máquinas, pelo número de aparelhos.",
  },
};

/**
 * Equatorial, aparelhos de aquecimento: de onde vem o FD sugerido (Q33). Duas tabelas da norma servem; o mock aprovado pelo
 * dono oferece a escolha por cálculo, nomeada pelo conteúdo (a tela não cita tabela). O FD continua editável linha a linha.
 */
export function EscolhaFdAquecimento({ calculo, podeEditar, onChange }: { calculo: Pick<CalculoEstudo, "fdAquecimento">; podeEditar: boolean; onChange: (v: CriterioFdAquecimento) => void }) {
  const atual = calculo.fdAquecimento ?? "potencia";
  return (
    <div className="space-y-1.5">
      <Rotulo>De onde vem o FD sugerido dos aparelhos de aquecimento</Rotulo>
      <div role="radiogroup" aria-label="Critério do FD de aquecimento" className="grid gap-2 sm:grid-cols-2">
        {CRITERIOS_FD_AQUECIMENTO.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={atual === c}
            disabled={!podeEditar}
            onClick={() => onChange(c)}
            className="flex items-start gap-2.5 rounded-md border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-primary aria-checked:bg-muted disabled:opacity-60"
          >
            <span aria-hidden className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${atual === c ? "border-primary bg-primary" : "border-input"}`} />
            <span>
              <span className="block text-sm font-semibold">
                {OPCOES[c].titulo}
                {OPCOES[c].recomendado && <span className="ml-2 rounded-sm border border-primary/30 bg-primary/10 px-1.5 text-[10px] font-bold uppercase">recomendado</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{OPCOES[c].texto}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">A escolha vale só para este cálculo. O FD continua editável linha a linha.</p>
    </div>
  );
}
