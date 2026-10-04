/**
 * Smoke do aviso de ausência que afeta alocação (Gestão de Pessoas F1.5). SÓ LEITURA: não cria
 * férias nem notificação — roda `impactoNaJanela` para cada recurso ativo nas próximas 4 semanas
 * e confere, contra a própria matriz, que o resultado bate com as alocações vigentes.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/smoke-impacto-ausencia.ts
 */
import { prisma } from "@/lib/prisma";
import { diaLocal } from "@/modules/ponto/engine";
import { impactoNaJanela } from "@/modules/planejamento/impacto-ausencia-service";
import { janelaDeImpacto } from "@/modules/planejamento/impacto-ausencia";
import { somarDias } from "@/lib/dias-iso";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

async function main() {
  const hoje = diaLocal(new Date());
  const janela = janelaDeImpacto({ inicio: hoje, fim: somarDias(hoje, 27) }, hoje)!;
  ok(janela.inicio === hoje, `janela começa hoje (${janela.inicio} a ${janela.fim})`);
  ok(janelaDeImpacto({ inicio: somarDias(hoje, -30), fim: somarDias(hoje, -1) }, hoje) === null, "ausência passada não gera aviso");

  const aprovados = new Set(
    (await prisma.cronogramaProjeto.findMany({ where: { aprovado: true }, select: { projetoId: true } })).map((c) => c.projetoId),
  );
  const recursos = await prisma.recurso.findMany({
    where: { ativo: true },
    select: { userId: true, user: { select: { name: true } }, alocacoes: { select: { projetoId: true, percentual: true, inicio: true, fim: true } } },
  });
  ok(recursos.length > 0, `${recursos.length} recurso(s) ativo(s) no banco`);

  let comImpacto = 0;
  for (const r of recursos) {
    const impacto = await impactoNaJanela(r.userId, janela);
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    // Digitada esperada: projeto SEM cronograma aprovado, % > 0, faixa tocando a janela.
    const esperadoDigitado = new Set(
      r.alocacoes
        .filter((a) => !aprovados.has(a.projetoId) && a.percentual > 0)
        .filter((a) => (!a.inicio || iso(a.inicio)! <= janela.fim) && (!a.fim || iso(a.fim)! >= janela.inicio))
        .map((a) => a.projetoId),
    );
    const digitados = new Set(impacto.filter((p) => p.percentual > 0).map((p) => p.projetoId));
    const iguais = esperadoDigitado.size === digitados.size && [...esperadoDigitado].every((id) => digitados.has(id));
    ok(iguais, `${r.user.name}: ${digitados.size} projeto(s) por alocação digitada, ${impacto.filter((p) => p.horas > 0).length} por cronograma`);
    ok(
      impacto.every((p) => !aprovados.has(p.projetoId) || p.percentual === 0),
      `${r.user.name}: projeto aprovado não usa a alocação digitada (D17)`,
    );
    ok(
      impacto.every((p) => p.inicio >= janela.inicio && p.fim <= janela.fim && p.inicio <= p.fim),
      `${r.user.name}: trechos dentro da janela`,
    );
    if (impacto.length > 0) comImpacto++;
  }
  console.log(`\n${comImpacto} de ${recursos.length} recurso(s) gerariam aviso se saíssem de férias agora.`);
  console.log(falhas === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
