/**
 * Onda E, passo 2 (§6.4 do plano): materializa `EscalaUsuario` para 100% dos internos ativos
 * a partir da grade vigente hoje (override próprio se já tiver, senão `EscalaRole[role]`).
 *
 * Puramente aditivo e IDEMPOTENTE — quem já tem QUALQUER linha em `EscalaUsuario` é pulado
 * (mesmo que parcial/inativa: não sobrescreve edição manual existente). Grava exatamente o
 * valor que `resolverEscala`/`horasDiaPadraoEmLote` já calculavam via `EscalaRole`, então
 * ninguém muda de jornada — é pré-requisito para criar `EscalaContratacao` sem colisão
 * (hoje `administrativo`/`clt`/`ti` têm grades potencialmente diferentes, mas colapsariam no
 * mesmo slot quando a chave virar a contratação em vez do role).
 *
 * Verificado antes de escrever isto: TODO consumidor real (`resolverEscala` em
 * modules/ponto/service.ts, `horasDiaPadraoEmLote` em rh/escalas/queries.ts — o do rateio,
 * dinheiro de verdade) já cruza corretamente com `escalaRoleGrade(role)` quando o usuário não
 * tem override — o fallback interno de `escalaUsuarioGrade` (diaPadrao 8h) nunca é alcançado
 * na prática. Não havia bug vivo a corrigir aqui, só o passo de materialização em si.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/materializar-escala-usuario.ts [--dry-run]
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.4)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { usuariosParaEscala, escalaRoleGrade, horasDiaPadraoEmLote } from "../src/modules/rh/escalas/queries";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const usuarios = await usuariosParaEscala();

  // Snapshot ANTES — prova de não-regressão (mesmo espírito do arnês de equivalência de permissões).
  const antes = await horasDiaPadraoEmLote(usuarios);

  let materializados = 0;
  let pulados = 0;
  let linhas = 0;

  for (const u of usuarios) {
    const existentes = await prisma.escalaUsuario.count({ where: { userId: u.id } });
    if (existentes > 0) {
      pulados++;
      continue;
    }

    const grade = await escalaRoleGrade(u.role);
    if (!DRY_RUN) {
      await prisma.escalaUsuario.createMany({
        data: grade.map((d) => ({
          userId: u.id,
          diaSemana: d.diaSemana,
          entrada: d.entrada,
          saida: d.saida,
          descansos: d.descansos,
          horasDia: d.horasDia,
          ativo: d.ativo,
          toleranciaMin: d.toleranciaMin,
        })),
      });
    }
    materializados++;
    linhas += grade.length;
  }

  console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}${usuarios.length} usuário(s) internos ativos.`);
  console.log(`  ✔ ${materializados} materializado(s) (${linhas} linha(s)) · ${pulados} pulado(s) (já tinham escala própria)`);

  if (!DRY_RUN) {
    const depois = await horasDiaPadraoEmLote(usuarios);
    let divergencias = 0;
    for (const u of usuarios) {
      if (antes.get(u.id) !== depois.get(u.id)) {
        divergencias++;
        console.error(`  ✖ ${u.name}: horas/dia mudou de ${antes.get(u.id)} para ${depois.get(u.id)}`);
      }
    }
    if (divergencias === 0) console.log("  ✔ Zero mudança de jornada (horasDiaPadraoEmLote idêntico antes/depois).");
    else process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
