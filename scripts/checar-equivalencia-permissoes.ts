/**
 * Gate da Onda B (§6.2): compara a matriz legada (`can(role,...)`, incluindo piso de sócio)
 * com a matriz do motor novo (`permissaoEfetiva()`, perfil + override), célula a célula, para
 * todo usuário interno ativo × todo par recurso:ação do catálogo.
 *
 * Critério assimétrico — é a garantia de fail-closed da migração:
 *   - GANHO (false→true): FALHA DURA. Exit 1. Exceção só via `lib/allowlist-equivalencia.ts`,
 *     versionada, com motivo e aprovação. Ganho coberto por exceção continua sendo IMPRESSO.
 *   - PERDA (true→false): warning. Não bloqueia, mas é listada célula a célula — pode ser
 *     mudança intencional (ex.: a poda do piso de sócio) ou um buraco.
 *
 * Mede **duas fórmulas**, porque os dois caminhos de autorização divergem: `requirePermission`
 * (páginas) aplica o piso de sócio e `defineAction` (Server Actions) não. Ver `ViaAutorizacao`.
 *
 * Duas coisas que este script aprendeu na marra e que valem para qualquer gate:
 *   - **comparação vazia é falha, não sucesso** (ver a guarda de `antes.length === 0`);
 *   - **mensagem de gate reporta medição, não afirma diagnóstico** — a versão anterior dizia
 *     "isso é ganho de ESCRITA" de forma fixa e contradizia a própria lista.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-permissoes.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, R1)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { permissaoEfetiva } from "../src/lib/permissao-efetiva";
import { compararPermissoes, type CelulaPermissao } from "../src/lib/equivalencia-permissoes";
import { ehLeitura } from "../src/lib/permissions-catalog";
import { excecaoDe, excecoesObsoletas, mensagemFinalDoGate } from "../src/lib/allowlist-equivalencia";
import { gerarSnapshotLegado, hashUserId } from "./snapshot-permissoes";

async function gerarMatrizPerfil(antes: CelulaPermissao[]): Promise<CelulaPermissao[]> {
  const userIds = [...new Set(antes.map((c) => c.userId))];
  const usuarios = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, ativo: true, superUsuario: true, perfilId: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  const depois: CelulaPermissao[] = [];
  for (const c of antes) {
    const u = porId.get(c.userId);
    const permitido = u
      ? await permissaoEfetiva(
          { id: u.id, ativo: u.ativo, superUsuario: u.superUsuario, perfilId: u.perfilId },
          c.recurso,
          c.acao,
        )
      : false;
    depois.push({ ...c, permitido });
  }
  return depois;
}

async function main() {
  console.log("Calculando matriz legada (can por role + piso de sócio)...");
  const antes = await gerarSnapshotLegado();

  console.log("Calculando matriz nova (permissaoEfetiva por perfil + override)...");
  const depois = await gerarMatrizPerfil(antes);

  const { ganhos, perdas } = compararPermissoes(antes, depois);

  const anonimizar = (d: (typeof ganhos)[number]) => ({ ...d, userId: hashUserId(d.userId) });
  // Identificacao CONSISTENTE nos tres blocos: id real (para o operador achar a pessoa) mais o
  // hash (que e a chave da allowlist e do relatorio). Antes, perdas saiam com cuid e ganhos com
  // hash — a mesma pessoa em duas representacoes, impossivel de correlacionar a olho.
  const ident = (userId: string) => `${userId} (hash ${hashUserId(userId)})`;

  // Ganho coberto por exceção versionada continua sendo IMPRESSO — só não bloqueia. Exceção
  // silenciosa não serve para nada: o objetivo da allowlist é registrar a mudança intencional,
  // não fazer o gate calar.
  // A busca na allowlist usa o HASH (é a chave versionada), mas as listas ficam com o id REAL —
  // só o relatório em disco anonimiza. Assim os três blocos do console falam a mesma língua.
  const excecaoDoGanho = (g: (typeof ganhos)[number]) => excecaoDe({ ...g, userId: hashUserId(g.userId) });
  const aceitos = ganhos.filter((g) => excecaoDoGanho(g) !== undefined);
  const bloqueantes = ganhos.filter((g) => excecaoDoGanho(g) === undefined);
  const usuariosPresentes = new Set(antes.map((c) => hashUserId(c.userId)));
  const obsoletas = excecoesObsoletas(ganhos.map(anonimizar), usuariosPresentes);

  const relatorio = {
    geradoEm: new Date().toISOString(),
    totalCelulas: antes.length,
    totalUsuarios: new Set(antes.map((c) => c.userId)).size,
    ganhos: bloqueantes.map(anonimizar),
    ganhosAceitos: aceitos.map((g) => ({ ...anonimizar(g), excecao: excecaoDoGanho(g) })),
    excecoesObsoletas: obsoletas,
    perdas: perdas.map(anonimizar),
  };

  const dir = join(process.cwd(), "logs");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `equivalencia-permissoes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(arquivo, JSON.stringify(relatorio, null, 2), "utf8");

  const porVia = (v: string) => antes.filter((c) => (c.via ?? "requirePermission") === v).length;
  console.log(`\n${relatorio.totalUsuarios} usuário(s) × ${antes.length} célula(s) comparada(s).`);
  console.log(`  ${porVia("requirePermission")} via requirePermission (com piso de sócio) · ${porVia("defineAction")} via defineAction (sem piso).`);
  console.log(`  → relatório completo: ${arquivo}`);

  // Comparação vazia é FALHA, não sucesso. Sem esta guarda o script imprime "zero ganhos" e
  // sai 0 tendo comparado NADA — foi o que aconteceu ao rodar contra um restore de produção
  // onde a Fase 0 nunca rodou: `gerarSnapshotLegado` filtra `tipo: "interno"`, todo mundo em
  // produção tem `tipo` nulo, e o gate deu verde com 0 usuários (§15.2 do plano). Um gate que
  // aprova o conjunto vazio é pior que gate nenhum, porque dá a impressão de ter medido.
  if (antes.length === 0) {
    console.error("\n✖ Nenhuma célula comparada — o gate não mediu nada.");
    console.error("  Causa provável: nenhum usuário com `ativo: true` E `tipo: \"interno\"`.");
    console.error("  Se for um restore de produção, rode antes o backfill da Fase 0:");
    console.error("    npx tsx --tsconfig tsconfig.server.json scripts/backfill-vinculos.ts");
    await prisma.$disconnect();
    process.exit(1);
  }

  if (perdas.length > 0) {
    // A justificativa "esperado antes da Onda B semear perfis reais" saiu daqui: ela era
    // verdadeira na Onda A, quando `perfilId` era nulo em todo mundo, e virou mentira assim que
    // os perfis foram semeados — em 2026-08-09, em produção, ela apareceu explicando perdas
    // cuja causa real era a poda do piso de sócio. Warning não deve carregar diagnóstico
    // adivinhado: lista o que perdeu e deixa a leitura para quem sabe o que mudou.
    console.warn(`\n⚠ ${perdas.length} perda(s) de acesso — NÃO bloqueia, mas confira se é intencional:`);
    for (const p of perdas.slice(0, 20)) {
      console.warn(`  - [${p.role}] ${ident(p.userId)}: ${p.recurso}:${p.acao} (via ${p.via ?? "requirePermission"})`);
    }
    if (perdas.length > 20) console.warn(`  ... e mais ${perdas.length - 20}.`);
  }

  if (aceitos.length > 0) {
    console.log(`\n● ${aceitos.length} ganho(s) COBERTO(S) por allowlist versionada — não bloqueiam:`);
    for (const g of aceitos) {
      const e = excecaoDoGanho(g)!;
      console.log(`  - [${g.role}] ${ident(g.userId)}: ${g.recurso}:${g.acao} (via ${g.via}) — ${e.aprovadoPor}, ${e.aprovadoEm}`);
    }
  }

  if (obsoletas.length > 0) {
    console.warn(`\n⚠ ${obsoletas.length} exceção(ões) da allowlist não casaram com nada — remova de src/lib/allowlist-equivalencia.ts:`);
    for (const e of obsoletas) console.warn(`  - ${e.userIdHash}: ${e.recurso}:${e.acao} (via ${e.via})`);
  }

  if (bloqueantes.length > 0) {
    const ganhos = bloqueantes;
    console.error(`\n✖ ${ganhos.length} GANHO(S) DE ACESSO DETECTADO(S) — bloqueante:`);
    for (const g of ganhos.slice(0, 20)) {
      console.error(
        `  - [${g.role}] ${ident(g.userId)}: ${g.recurso}:${g.acao} passou de negado para permitido (via ${g.via ?? "requirePermission"})`,
      );
    }
    if (ganhos.length > 20) console.error(`  ... e mais ${ganhos.length - 20}.`);
    const porDefineAction = ganhos.filter((g) => g.via === "defineAction");
    if (porDefineAction.length > 0) {
      const escrita = porDefineAction.filter((g) => !ehLeitura(g.recurso, g.acao));
      console.error(
        "\n  Ganhos em `defineAction` costumam ser o piso de sócio: hoje ele vale em\n" +
          "  `requirePermission` (páginas) mas NÃO em `with-action` (Server Actions), e\n" +
          "  `permissaoEfetiva` não faz essa distinção.",
      );
      // A classificação é CALCULADA, não afirmada. A versão anterior desta mensagem dizia
      // "isso é ganho de ESCRITA" de forma fixa e contradizia a própria lista logo acima —
      // um operador que lesse só o rodapé concluiria que liberou escrita para um sócio.
      console.error(
        escrita.length > 0
          ? `  ${escrita.length} de ${porDefineAction.length} são de ESCRITA: ${escrita
              .map((g) => `${g.recurso}:${g.acao}`)
              .join(", ")} — decidir antes de virar, não depois.`
          : `  Todos os ${porDefineAction.length} são de LEITURA. Ainda assim é ganho e bloqueia:\n` +
            "  mudança intencional passa por allowlist versionada e aprovada, não por exceção no gate.",
      );
    }
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`\n${mensagemFinalDoGate(aceitos.length, bloqueantes.length)}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
