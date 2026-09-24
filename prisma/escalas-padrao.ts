/**
 * Semeadura da escala PADRÃO por contratação (`EscalaContratacao`).
 *
 * Roda dentro do `db:seed` (idempotente). Até a Onda E passo 4 a semente ia para `EscalaRole`
 * (grade por papel) e era espelhada daqui para `EscalaContratacao`; com a tabela por papel
 * removida, a semente vai direto para a contratação.
 *
 * Estágio nasce com 6h × 5 dias (30h/semana, o teto da Lei 11.788, art. 10, II).
 *
 * Idempotência: cria só o que está ausente e **nunca sobrescreve** linha existente — nem de
 * estágio. Até 2026-09-24 o seed reescrevia para 6h todo dia de estágio acima disso; saiu porque
 * o escritório compensa horas entre os dias ("jogo de horas") e o seed de cada deploy desfaria a
 * compensação. O teto que vale é o semanal, travado na escrita (`excessoJornadaEstagio`).
 *
 * `pj`, `autonomo_rpa` e `pro_labore` ficam SEM linha, de propósito — ver a nota em
 * `EscalaContratacao` no schema.
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.4)
 */
import { prisma } from "../src/lib/prisma";
import { HORAS_DIA_ESTAGIO } from "../src/modules/rh/escalas/schemas";

const DIAS_UTEIS = [1, 2, 3, 4, 5]; // segunda..sexta

type GradePadrao = {
  contratacao: "clt" | "estagio";
  entrada: string;
  saida: string;
  descansos: { inicio: string; fim: string }[];
  horasDia: number;
};

const GRADES: GradePadrao[] = [
  { contratacao: "clt", entrada: "08:00", saida: "17:00", descansos: [{ inicio: "12:00", fim: "13:00" }], horasDia: 8 },
  { contratacao: "estagio", entrada: "08:00", saida: "14:00", descansos: [], horasDia: HORAS_DIA_ESTAGIO },
];

export async function semearEscalaContratacaoPadrao() {
  let criadas = 0;

  for (const g of GRADES) {
    for (const diaSemana of DIAS_UTEIS) {
      const existe = await prisma.escalaContratacao.findUnique({
        where: { contratacao_diaSemana: { contratacao: g.contratacao, diaSemana } },
        select: { id: true },
      });
      if (existe) continue;

      await prisma.escalaContratacao.create({
        data: {
          contratacao: g.contratacao,
          diaSemana,
          entrada: g.entrada,
          saida: g.saida,
          descansos: g.descansos,
          horasDia: g.horasDia,
          toleranciaMin: 10,
        },
      });
      criadas++;
    }
  }

  console.log(`✔ EscalaContratacao: ${criadas} linha(s) criada(s).`);
  return { criadas };
}
