/**
 * Semeadura da escala PADRÃO por perfil (`EscalaRole`).
 *
 * Roda dentro do `db:seed` (idempotente) — antes vivia só em `scripts/migrar-escalas.ts`,
 * que não estava no `package.json` e portanto podia nunca ter rodado. Nos dois cenários o
 * estagiário acabava com 8h/dia: se o script rodou, com 8h explícita no banco; se não rodou,
 * `completarSemana` cai em `diaPadrao()` (`rh/escalas/queries.ts`), que também é 8h.
 *
 * Estagiário tem jornada legal distinta: **máx. 6h/dia e 30h/semana** (Lei 11.788, art. 10, II).
 * A grade de 8h fazia o espelho de ponto — assinado com hash SHA-256 em `EspelhoAceite` —
 * documentar jornada acima do limite legal do estágio.
 *
 * Regras de idempotência:
 *  - perfis de 8h: cria só se ausente (nunca sobrescreve grade ajustada na tela `/rh/escalas`);
 *  - `estagiario`: cria se ausente e **corrige** linhas existentes acima de 6h — a correção é o
 *    motivo deste arquivo existir, então ela não pode ser pulada por idempotência.
 *
 * Materializar `administrativo`/`clt`/`ti` explicitamente também é pré-requisito da futura
 * `EscalaContratacao`: hoje as três grades "coincidem" apenas porque a tabela está vazia, e as
 * três colapsam no mesmo slot quando a chave passa a ser a contratação.
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.4)
 */
import { prisma } from "../src/lib/prisma";

const DIAS_UTEIS = [1, 2, 3, 4, 5]; // segunda..sexta

/** Jornada máxima diária do estágio (Lei 11.788, art. 10, II). */
export const HORAS_DIA_ESTAGIO = 6;

type GradePadrao = {
  role: "clt" | "administrativo" | "ti" | "estagiario";
  entrada: string;
  saida: string;
  descansos: { inicio: string; fim: string }[];
  horasDia: number;
};

const GRADES: GradePadrao[] = [
  { role: "clt", entrada: "08:00", saida: "17:00", descansos: [{ inicio: "12:00", fim: "13:00" }], horasDia: 8 },
  { role: "administrativo", entrada: "08:00", saida: "17:00", descansos: [{ inicio: "12:00", fim: "13:00" }], horasDia: 8 },
  { role: "ti", entrada: "08:00", saida: "17:00", descansos: [{ inicio: "12:00", fim: "13:00" }], horasDia: 8 },
  { role: "estagiario", entrada: "08:00", saida: "14:00", descansos: [], horasDia: HORAS_DIA_ESTAGIO },
];

export async function semearEscalaRolePadrao() {
  let criadas = 0;
  let corrigidas = 0;

  for (const g of GRADES) {
    for (const diaSemana of DIAS_UTEIS) {
      const existe = await prisma.escalaRole.findUnique({
        where: { role_diaSemana: { role: g.role, diaSemana } },
        select: { id: true, horasDia: true },
      });

      if (!existe) {
        await prisma.escalaRole.create({
          data: {
            role: g.role,
            diaSemana,
            entrada: g.entrada,
            saida: g.saida,
            descansos: g.descansos,
            horasDia: g.horasDia,
            toleranciaMin: 10,
          },
        });
        criadas++;
        continue;
      }

      // Correção legal: estagiário acima do teto de 6h volta para a grade legal.
      if (g.role === "estagiario" && Number(existe.horasDia) > HORAS_DIA_ESTAGIO) {
        await prisma.escalaRole.update({
          where: { id: existe.id },
          data: { entrada: g.entrada, saida: g.saida, descansos: g.descansos, horasDia: g.horasDia },
        });
        corrigidas++;
      }
    }
  }

  console.log(
    `✔ EscalaRole: ${criadas} linha(s) criada(s); ${corrigidas} linha(s) de estagiário corrigida(s) para ${HORAS_DIA_ESTAGIO}h/dia.`,
  );
  return { criadas, corrigidas };
}
