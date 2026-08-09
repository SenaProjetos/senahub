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

/** Papéis que colapsam em `contratacao = clt` quando a chave deixa de ser o papel (§6.4). */
const ROLES_QUE_VIRAM_CLT = ["clt", "administrativo", "ti"] as const;

/**
 * Espelha `EscalaRole` em `EscalaContratacao` (Onda E, passo 3 de §6.4).
 *
 * Copia em vez de semear de constante para não criar uma SEGUNDA fonte de verdade: se alguém
 * ajustou a grade pela tela `/rh/escalas`, o ajuste tem que atravessar a virada. Cria só o que
 * falta — nunca sobrescreve linha já existente, que pode ter sido editada depois da migração.
 *
 * **Recusa em vez de escolher.** `clt`, `administrativo` e `ti` colapsam no mesmo slot `clt`, e é
 * a colisão que §6.4 previu. Se as três grades divergirem, não há resposta certa automática:
 * jornada errada vira banco de horas e falta errados RETROATIVAMENTE (R4), então o script para e
 * pede decisão humana em vez de eleger uma vencedora em silêncio.
 */
export async function semearEscalaContratacao() {
  const roleRows = await prisma.escalaRole.findMany();
  const chave = (r: (typeof roleRows)[number]) =>
    `${r.entrada ?? "-"}|${r.saida ?? "-"}|${Number(r.horasDia)}|${r.ativo}|${r.toleranciaMin}|${JSON.stringify(r.descansos)}`;

  // Guarda de divergência, dia a dia.
  for (const diaSemana of DIAS_UTEIS) {
    const doDia = ROLES_QUE_VIRAM_CLT.map((role) => roleRows.find((r) => r.role === role && r.diaSemana === diaSemana))
      .filter((r): r is NonNullable<typeof r> => r != null);
    const distintas = new Set(doDia.map(chave));
    if (distintas.size > 1) {
      const detalhe = doDia.map((r) => `${r.role}=${r.entrada}-${r.saida}/${Number(r.horasDia)}h`).join(" · ");
      throw new Error(
        `EscalaContratacao: grades divergentes no dia ${diaSemana} entre ${ROLES_QUE_VIRAM_CLT.join("/")} (${detalhe}). ` +
          "As três viram `contratacao = clt` e não há vencedora óbvia — unifique em /rh/escalas antes de rodar o seed. " +
          "Ver §6.4 do plano de Setor × Contratação × Perfil de acesso.",
      );
    }
  }

  const origem: { contratacao: "clt" | "estagio"; role: string }[] = [
    { contratacao: "clt", role: "clt" },
    { contratacao: "estagio", role: "estagiario" },
  ];

  let criadas = 0;
  for (const { contratacao, role } of origem) {
    for (const diaSemana of DIAS_UTEIS) {
      const base =
        roleRows.find((r) => r.role === role && r.diaSemana === diaSemana) ??
        // `clt` pode estar ausente mas `administrativo`/`ti` presentes — já provados idênticos.
        roleRows.find((r) => ROLES_QUE_VIRAM_CLT.includes(r.role as never) && r.diaSemana === diaSemana);
      if (!base) continue;

      const existe = await prisma.escalaContratacao.findUnique({
        where: { contratacao_diaSemana: { contratacao, diaSemana } },
        select: { id: true },
      });
      if (existe) continue;

      await prisma.escalaContratacao.create({
        data: {
          contratacao,
          diaSemana,
          entrada: base.entrada,
          saida: base.saida,
          descansos: base.descansos as never,
          horasDia: base.horasDia,
          ativo: base.ativo,
          toleranciaMin: base.toleranciaMin,
        },
      });
      criadas++;
    }
  }

  // `pj`, `autonomo_rpa` e `pro_labore` ficam SEM linha, de propósito — ver a nota no schema.
  console.log(`✔ EscalaContratacao: ${criadas} linha(s) criada(s) a partir da EscalaRole.`);
  return { criadas };
}
