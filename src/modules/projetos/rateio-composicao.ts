import { ehJornada } from "@/lib/contratacao";
import type { Contratacao } from "@/generated/prisma/enums";

type RateioComRole = {
  custo: number;
  /** Contratação de quem apontou (cache do vínculo ativo). Era o papel até a Onda F. */
  contratacao: Contratacao | null;
};

/** Separa o rateio fechado para explicitar o custo de jornada CLT/estágio no resultado do projeto. */
export function separarRateioPorVinculo(rateios: RateioComRole[]) {
  let cltEstagiariosCentavos = 0;
  let demaisColaboradoresCentavos = 0;

  for (const rateio of rateios) {
    const centavos = Math.round(rateio.custo * 100);
    if (ehJornada(rateio.contratacao)) cltEstagiariosCentavos += centavos;
    else demaisColaboradoresCentavos += centavos;
  }

  const cltEstagiarios = cltEstagiariosCentavos / 100;
  const demaisColaboradores = demaisColaboradoresCentavos / 100;
  return {
    cltEstagiarios,
    demaisColaboradores,
    total: cltEstagiarios + demaisColaboradores,
  };
}
