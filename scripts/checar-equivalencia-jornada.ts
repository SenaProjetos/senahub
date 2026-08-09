/**
 * Gate de JORNADA da Onda E (§6.4, R4). Compara, para cada usuário interno ativo, a grade
 * semanal que ele teria pelo caminho ANTIGO (override do usuário, senão `EscalaRole[role]`) com a
 * que passa a ter pelo caminho NOVO (override, senão `EscalaContratacao[contratacao]`).
 *
 * Por que este gate existe, e por que ele é diferente dos outros dois: jornada errada não é
 * "alguém vê o que não devia". É **banco de horas e falta errados RETROATIVAMENTE** — o R4 do
 * plano — e vira `EspelhoAceite`, que guarda hash SHA-256 do espelho assinado. Um erro aqui
 * produz prova assinada de jornada que não aconteceu. Nenhum dos outros arnêses cobre isso:
 * escala não é permissão nem audiência.
 *
 * **Qualquer diferença é falha dura.** Não há assimetria útil aqui: tanto reduzir quanto aumentar
 * a jornada esperada de alguém falsifica o espelho, o saldo e a folha. Mudança intencional de
 * grade se faz pela tela `/rh/escalas`, com a pessoa sabendo — não numa migração.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-jornada.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.4, R4)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { escalaRoleGrade, escalaContratacaoGrade, escalaUsuarioGrade } from "../src/modules/rh/escalas/queries";
import { hashUserId } from "./snapshot-permissoes";
import type { Role } from "../src/lib/roles";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** Assinatura textual de um dia — o que muda aqui muda espelho, saldo e folha. */
function assinatura(d: { ativo: boolean; entrada: string | null; saida: string | null; horasDia: number }): string {
  return d.ativo ? `${d.entrada ?? "-"}-${d.saida ?? "-"}/${d.horasDia}h` : "folga";
}

async function main() {
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, tipo: "interno" },
    select: { id: true, role: true, contratacao: true },
  });

  if (usuarios.length === 0) {
    // Mesma guarda do gate de permissão: comparação vazia é falha, não sucesso.
    console.error("✖ Nenhum usuário interno ativo — o gate não mediu nada.");
    console.error("  Se for um restore de produção, rode antes scripts/backfill-vinculos.ts.");
    await prisma.$disconnect();
    process.exit(1);
  }

  let divergentes = 0;
  let comparados = 0;

  for (const u of usuarios) {
    const override = await escalaUsuarioGrade(u.id);
    // Quem tem override ativo não depende da grade padrão em nenhum dos dois caminhos —
    // registra-se como comparado, mas a diferença é impossível por construção.
    const antes = override.temOverride ? override.dias : await escalaRoleGrade(u.role as Role);
    const depois = override.temOverride ? override.dias : await escalaContratacaoGrade(u.contratacao);
    comparados++;

    const difs: string[] = [];
    for (let d = 0; d < 7; d++) {
      const a = assinatura(antes[d]);
      const b = assinatura(depois[d]);
      if (a !== b) difs.push(`${DIAS[d]}: ${a} → ${b}`);
    }

    if (difs.length > 0) {
      divergentes++;
      console.error(
        `\n✖ [${u.role}/${u.contratacao ?? "sem contratação"}] ${u.id} (hash ${hashUserId(u.id)}) — ${difs.length} dia(s):`,
      );
      for (const l of difs) console.error(`    ${l}`);
    }
  }

  console.log(`\n${comparados} usuário(s) interno(s) ativo(s) comparado(s), 7 dias cada.`);

  /**
   * Comparação da GRADE PADRÃO em si, papel a papel — independente de usuário.
   *
   * Sem isto o gate perde os dentes numa base onde todo mundo já tem override (como o dev depois
   * do passo 2 de §6.4): a comparação por usuário vira override-contra-override, sempre igual, e
   * um erro na semeadura de `EscalaContratacao` passaria batido — só para aparecer no primeiro
   * colaborador contratado DEPOIS da virada, que é o pior momento possível para descobrir.
   */
  const MAPA_PADRAO: { role: Role; contratacao: "clt" | "estagio" }[] = [
    { role: "clt", contratacao: "clt" },
    { role: "administrativo", contratacao: "clt" },
    { role: "ti", contratacao: "clt" },
    { role: "estagiario", contratacao: "estagio" },
  ];

  let padroesDivergentes = 0;
  for (const { role, contratacao } of MAPA_PADRAO) {
    const antes = await escalaRoleGrade(role);
    const depois = await escalaContratacaoGrade(contratacao);
    const difs: string[] = [];
    for (let d = 0; d < 7; d++) {
      const a = assinatura(antes[d]);
      const b = assinatura(depois[d]);
      if (a !== b) difs.push(`${DIAS[d]}: ${a} → ${b}`);
    }
    if (difs.length > 0) {
      padroesDivergentes++;
      console.error(`\n✖ grade padrão ${role} → ${contratacao} — ${difs.length} dia(s):`);
      for (const l of difs) console.error(`    ${l}`);
    }
  }
  console.log(`${MAPA_PADRAO.length} grade(s) padrão comparada(s) (papel → contratação).`);
  divergentes += padroesDivergentes;

  if (divergentes > 0) {
    console.error(
      `\n✖ ${divergentes} usuário(s) com jornada DIFERENTE — bloqueante.\n` +
        "  Jornada errada vira banco de horas e falta errados retroativamente, e o espelho é\n" +
        "  assinado com hash. Confira se falta rodar `db:seed` (semeia EscalaContratacao a partir\n" +
        "  da EscalaRole) ou `scripts/backfill-vinculos.ts` (preenche `contratacao`).",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("✔ Jornada idêntica para todo mundo. A troca de EscalaRole por EscalaContratacao não mexeu em ninguém.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
