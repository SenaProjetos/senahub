import { CLT_ROLES, type Role } from "@/lib/roles";

type RateioComRole = {
  custo: number;
  role: Role;
};

/** Separa o rateio fechado para explicitar o custo de jornada CLT/estágio no resultado do projeto. */
export function separarRateioPorVinculo(rateios: RateioComRole[]) {
  let cltEstagiariosCentavos = 0;
  let demaisColaboradoresCentavos = 0;

  for (const rateio of rateios) {
    const centavos = Math.round(rateio.custo * 100);
    if (CLT_ROLES.includes(rateio.role)) cltEstagiariosCentavos += centavos;
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
