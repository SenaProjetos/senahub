import { ehJornada } from "@/lib/contratacao";
import type { Contratacao } from "@/generated/prisma/enums";

type RateioComRole = {
  custo: number;
  /** Natureza da linha (R2): reunião ligada ao projeto aparece à parte. Ausente = hora de projeto. */
  natureza?: "projeto" | "reuniao" | "nao_alocado";
  /** Contratação de quem apontou (cache do vínculo ativo). Era o papel até a Onda F. */
  contratacao: Contratacao | null;
};

/** Separa o rateio fechado para explicitar o custo de jornada CLT/estágio no resultado do projeto. */
export function separarRateioPorVinculo(rateios: RateioComRole[]) {
  let cltEstagiariosCentavos = 0;
  let demaisColaboradoresCentavos = 0;
  let reunioesCentavos = 0;

  for (const rateio of rateios) {
    const centavos = Math.round(rateio.custo * 100);
    if (rateio.natureza === "reuniao") reunioesCentavos += centavos;
    else if (ehJornada(rateio.contratacao)) cltEstagiariosCentavos += centavos;
    else demaisColaboradoresCentavos += centavos;
  }

  return {
    cltEstagiarios: cltEstagiariosCentavos / 100,
    demaisColaboradores: demaisColaboradoresCentavos / 100,
    reunioes: reunioesCentavos / 100,
    total: (cltEstagiariosCentavos + demaisColaboradoresCentavos + reunioesCentavos) / 100,
  };
}
