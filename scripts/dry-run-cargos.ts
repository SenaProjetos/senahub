/**
 * Dry-run da migração de `cargo`/`departamento` de texto livre para as tabelas de domínio
 * (sub-etapa 2.0 do plano "cadastro do colaborador").
 *
 * **SOMENTE LEITURA** — nenhum INSERT/UPDATE/DELETE. Serve para responder, contra o banco de
 * PRODUÇÃO, a condição de parada do plano: "a migração encontrou valores ambíguos?".
 *
 * O agrupamento vive em `modules/rh/catalogos/canonizar.ts` (puro e testado) porque a migração
 * da 2.1 usa o MESMO código — senão o relatório aprovado não descreveria o que de fato roda.
 *
 * Lê apenas `cargo`, `departamento` e `setor`. Não toca em CPF, salário nem dados bancários —
 * nada sensível entra na saída.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/dry-run-cargos.ts [--db <nome>]
 *   `--db` troca só o NOME do banco no DATABASE_URL, reusando host/porta/credenciais da mesma
 *   instância — é assim que se aponta para um snapshot restaurado sem manipular segredo.
 *
 * Saída: relatório em texto. Sai com código 1 se houver valor ambíguo (bloqueia a 2.1).
 */
import "dotenv/config";
import { chaveMatch } from "../src/lib/import/valores";
import { agrupar, contarValores, type Grupo } from "../src/modules/rh/catalogos/canonizar";
import type { Setor } from "../src/generated/prisma/client";

/**
 * Reescreve o banco alvo ANTES de qualquer import de `lib/prisma` — o cliente é construído no
 * import, lendo `process.env.DATABASE_URL` naquele instante. Por isso o Prisma entra por
 * `await import()` lá embaixo, e não por import estático no topo.
 */
function aplicarDbOverride(): void {
  const i = process.argv.indexOf("--db");
  const nome = i >= 0 ? process.argv[i + 1] : undefined;
  if (!nome) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida — --db não tem o que reescrever.");
  const u = new URL(url);
  u.pathname = `/${nome}`;
  process.env.DATABASE_URL = u.toString();
}

function imprimirGrupos(titulo: string, grupos: Grupo[]) {
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 62 - titulo.length))}`);
  if (grupos.length === 0) {
    console.log("   (nenhum valor preenchido)");
    return;
  }
  for (const g of grupos) {
    const marca = g.ambiguidades.length > 0 ? "!!" : g.variantes.length > 1 ? " ~" : "  ";
    console.log(`${marca} ${g.canonico.padEnd(38)} ${String(g.total).padStart(4)} pessoa(s)`);
    if (g.variantes.length > 1) {
      const outras = g.variantes.slice(1).map((v) => `"${v.valorCru}" (${v.n})`).join(", ");
      console.log(`      grafias que colapsam: ${outras}`);
    }
    for (const a of g.ambiguidades) console.log(`      AMBÍGUO: ${a}`);
  }
}

async function main() {
  aplicarDbOverride();
  const { prisma } = await import("../src/lib/prisma");

  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  console.log(`Banco lido: ${db}`);

  // Só os três campos do escopo + o setor (para sugerir o pai de cada departamento).
  const usuarios = await prisma.user.findMany({
    select: { cargo: true, departamento: true, setor: true },
  });
  const vinculos = await prisma.vinculo.findMany({ select: { cargo: true } });

  const gCargoUser = agrupar(contarValores(usuarios.map((u) => u.cargo)), "user.cargo");
  const gDepto = agrupar(contarValores(usuarios.map((u) => u.departamento)), "user.departamento");
  const gCargoVinc = agrupar(contarValores(vinculos.map((v) => v.cargo)), "vinculo.cargo");

  console.log("═══ DRY-RUN · cargo/departamento → tabelas de domínio (somente leitura) ═══");
  console.log(`Usuários lidos: ${usuarios.length} · Vínculos lidos: ${vinculos.length}`);
  console.log("Legenda:  !! = exige decisão sua   ~ = grafias diferentes que serão unificadas");

  imprimirGrupos("CARGOS (user.cargo)", gCargoUser);
  imprimirGrupos("CARGOS (vinculo.cargo)", gCargoVinc);
  imprimirGrupos("DEPARTAMENTOS (user.departamento)", gDepto);

  // Cargos que existem numa fonte e não na outra — as duas alimentam o mesmo catálogo.
  const chavesUser = new Set(gCargoUser.map((g) => g.chave));
  const chavesVinc = new Set(gCargoVinc.map((g) => g.chave));
  const soNoVinculo = gCargoVinc.filter((g) => !chavesUser.has(g.chave));
  const soNoUser = gCargoUser.filter((g) => !chavesVinc.has(g.chave));
  console.log(`\n── DIVERGÊNCIA ENTRE AS DUAS FONTES DE CARGO ${"─".repeat(22)}`);
  console.log(`   só em vinculo.cargo: ${soNoVinculo.map((g) => g.canonico).join(", ") || "(nenhum)"}`);
  console.log(`   só em user.cargo:    ${soNoUser.map((g) => g.canonico).join(", ") || "(nenhum)"}`);
  console.log(`   catálogo final de Cargo terá ${new Set([...chavesUser, ...chavesVinc]).size} item(ns) + "Sócio".`);

  // Sugestão de `Departamento.setor`: setor dominante entre quem usa aquele departamento.
  console.log(`\n── SUGESTÃO DE Departamento.setor ${"─".repeat(33)}`);
  if (gDepto.length === 0) {
    console.log("   (nenhum departamento preenchido)");
  } else {
    for (const g of gDepto) {
      const setores = new Map<Setor | "sem_setor", number>();
      for (const u of usuarios) {
        if (!u.departamento || chaveMatch(u.departamento) !== g.chave) continue;
        const k = u.setor ?? "sem_setor";
        setores.set(k, (setores.get(k) ?? 0) + 1);
      }
      const ranking = [...setores].sort((a, b) => b[1] - a[1]);
      const [topo, nTopo] = ranking[0] ?? ["sem_setor" as const, 0];
      const pct = g.total > 0 ? Math.round((nTopo / g.total) * 100) : 0;
      const sugestao =
        topo === "sem_setor" || pct < 80
          ? `INDEFINIDO (defina à mão) — distribuição: ${ranking.map(([s, n]) => `${s}=${n}`).join(" ")}`
          : `${topo} (${pct}% das pessoas)`;
      console.log(`   ${g.canonico.padEnd(38)} → ${sugestao}`);
    }
  }

  const todos = [...gCargoUser, ...gCargoVinc, ...gDepto];
  const ambiguos = todos.filter((g) => g.ambiguidades.length > 0);
  const unificados = todos.filter((g) => g.variantes.length > 1);

  console.log(`\n═══ VEREDITO ${"═".repeat(52)}`);
  console.log(`   grafias que serão unificadas: ${unificados.length}`);
  console.log(`   valores AMBÍGUOS: ${ambiguos.length}`);
  if (ambiguos.length > 0) {
    console.log("   → PARADA: resolva os itens marcados !! antes de rodar a 2.1.");
  } else {
    console.log("   → liberado para a 2.1 (confirme as grafias canônicas acima).");
  }

  await prisma.$disconnect();
  process.exit(ambiguos.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
