/**
 * Semeadura da escala PADRÃO por contratação (`EscalaContratacao`).
 *
 * Roda dentro do `db:seed` (idempotente). Até a Onda E passo 4 a semente ia para `EscalaRole`
 * (grade por papel) e era espelhada daqui para `EscalaContratacao`; com a tabela por papel
 * removida, a semente vai direto para a contratação.
 *
 * Estágio tem jornada legal distinta: **máx. 6h/dia e 30h/semana** (Lei 11.788, art. 10, II).
 * Grade de 8h faria o espelho de ponto — assinado com hash SHA-256 em `EspelhoAceite` —
 * documentar jornada acima do limite legal do estágio.
 *
 * Regras de idempotência:
 *  - `clt`: cria só se ausente (nunca sobrescreve grade ajustada na tela `/rh/escalas`);
 *  - `estagio`: cria se ausente e **corrige** linhas existentes acima de 6h — a correção legal
 *    não pode ser pulada por idempotência.
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
  let corrigidas = 0;

  for (const g of GRADES) {
    for (const diaSemana of DIAS_UTEIS) {
      const existe = await prisma.escalaContratacao.findUnique({
        where: { contratacao_diaSemana: { contratacao: g.contratacao, diaSemana } },
        select: { id: true, horasDia: true },
      });

      if (!existe) {
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
        continue;
      }

      // Correção legal: estágio acima do teto de 6h volta para a grade legal.
      if (g.contratacao === "estagio" && Number(existe.horasDia) > HORAS_DIA_ESTAGIO) {
        await prisma.escalaContratacao.update({
          where: { id: existe.id },
          data: { entrada: g.entrada, saida: g.saida, descansos: g.descansos, horasDia: g.horasDia },
        });
        corrigidas++;
      }
    }
  }

  console.log(
    `✔ EscalaContratacao: ${criadas} linha(s) criada(s); ${corrigidas} linha(s) de estágio corrigida(s) para ${HORAS_DIA_ESTAGIO}h/dia.`,
  );
  return { criadas, corrigidas };
}
