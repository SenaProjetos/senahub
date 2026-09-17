/**
 * Smoke do escopo de projetos de `listarDocumentosAgrupados`, contra o banco de dev.
 *
 * A consulta nasceu para UMA tela (a aba do projeto) e recebia um `projetoId`. Passou a receber
 * um CONJUNTO, para o diretório geral reusar a mesma regra em vez de duplicar 60 linhas de
 * `where`. O que o vitest não alcança — a consulta é SQL cru, e os testes rodam sem banco — é
 * justamente o que decide se o alargamento vazou dado entre usuários.
 *
 * Cobre:
 *  - vários projetos: o resultado é exatamente a UNIÃO dos resultados por projeto;
 *  - um projeto só: o caminho da aba do projeto, que não pode mudar;
 *  - escopo vazio: zero linhas — vazio é "não vê nada", nunca "sem filtro";
 *  - isolamento: o escopo de um usuário nunca traz documento do projeto do outro;
 *  - muralha por disciplina (`veTodas=false`) combinada com escopo de vários projetos.
 *
 * Cria clientes, projetos, disciplinas, documentos, uploads e usuários throwaway, e apaga tudo
 * no final. Uso: npm run smoke:documentos-escopo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { listarDocumentosAgrupados } from "../src/modules/uploads/documentos-agrupados";

const TAG = `SMKESC_${Date.now()}`;

function iguais(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

async function idsDe(projetoIds: string[], userId: string, veTodas: boolean): Promise<string[]> {
  const r = await listarDocumentosAgrupados({
    projetoIds,
    userId,
    veTodas,
    ehGlobal: false,
    podeEnviarCap: false,
    podeEditarMetadados: false,
    podeAlterarStatus: false,
    filtros: {},
    skip: 0,
    take: 500,
    sort: null,
    dir: "desc",
  });
  // `total` e a página têm de contar a mesma coisa: divergência aqui é bug de paginação.
  if (r.total !== r.linhas.length) {
    throw new Error(`total (${r.total}) != linhas (${r.linhas.length}) — página pequena demais para o smoke?`);
  }
  return r.linhas.map((l) => l.id);
}

async function criarProjeto(sufixo: string, donoId: string, responsavelId: string | null) {
  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${TAG}_cli_${sufixo}` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: `${TAG}_proj_${sufixo}`,
        clienteId: cliente.id,
        membros: { create: [{ userId: donoId, papel: "coordenador" }] },
        disciplinas: {
          create: [
            {
              disciplinaTextoLegado: "Estrutural",
              ordem: 0,
              ...(responsavelId ? { responsaveis: { create: [{ userId: responsavelId }] } } : {}),
            },
          ],
        },
      },
      include: { disciplinas: true },
    });
  });

  const disciplinaId = projeto.disciplinas[0].id;
  const nome = `${TAG}_${sufixo}.pdf`;
  const documento = await prisma.documentoDisciplina.create({
    data: { disciplinaId, chave: `A/${TAG}_${sufixo}`, nomeArquivo: nome },
  });
  await prisma.upload.create({
    data: {
      disciplinaId,
      documentoId: documento.id,
      pacote: "A",
      nomeArquivo: nome,
      caminho: `${TAG}/${sufixo}.pdf`,
      hashSha256: `${TAG}${sufixo}`.padEnd(64, "0").slice(0, 64),
      tamanho: 1024,
      autorId: donoId,
    },
  });
  return { clienteId: cliente.id, projetoId: projeto.id, disciplinaId, documentoId: documento.id };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(":5433/") || !url.includes("senahub_remake")) {
    throw new Error("Este smoke só roda no banco de dev (porta 5433, senahub_remake).");
  }

  let ok = true;
  const check = (nome: string, cond: boolean, detalhe?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  const criados: { clienteId: string; projetoId: string }[] = [];
  const usuarios: string[] = [];

  try {
    // Usuários throwaway: o isolamento precisa de dois escopos disjuntos de verdade, e depender
    // do dataset existente do dev tornaria o resultado diferente a cada máquina.
    const senha = { create: {} };
    void senha;
    const usuarioA = await prisma.user.create({
      data: { name: `${TAG}_A`, email: `${TAG.toLowerCase()}_a@smoke.local`, role: "projetista_pj", ativo: true },
    });
    const usuarioB = await prisma.user.create({
      data: { name: `${TAG}_B`, email: `${TAG.toLowerCase()}_b@smoke.local`, role: "projetista_pj", ativo: true },
    });
    usuarios.push(usuarioA.id, usuarioB.id);

    // A é dono de P1 e P2 (responsável pela disciplina só de P1); B é dono de P3.
    const p1 = await criarProjeto("p1", usuarioA.id, usuarioA.id);
    const p2 = await criarProjeto("p2", usuarioA.id, null);
    const p3 = await criarProjeto("p3", usuarioB.id, usuarioB.id);
    criados.push(p1, p2, p3);

    // ── 1. um projeto só (o caminho da aba do projeto) ──────────────────────
    const so1 = await idsDe([p1.projetoId], usuarioA.id, true);
    const so2 = await idsDe([p2.projetoId], usuarioA.id, true);
    check("projeto único devolve só o documento dele", iguais(so1, [p1.documentoId]), `${so1.length} linha(s)`);
    check("segundo projeto, isolado, idem", iguais(so2, [p2.documentoId]));

    // ── 2. vários projetos = união exata dos individuais ────────────────────
    const multi = await idsDe([p1.projetoId, p2.projetoId], usuarioA.id, true);
    check(
      "escopo de 2 projetos é a união dos escopos de 1",
      iguais(multi, [...so1, ...so2]),
      `${multi.length} = ${so1.length} + ${so2.length}`,
    );

    // ── 3. escopo vazio devolve nada (e não "tudo") ─────────────────────────
    const vazio = await idsDe([], usuarioA.id, true);
    check("escopo vazio devolve zero linhas", vazio.length === 0);

    // Repetido no escopo não duplica linha — `normalizarEscopoProjetos` deduplica antes do any().
    const repetido = await idsDe([p1.projetoId, p1.projetoId], usuarioA.id, true);
    check("projeto repetido no escopo não duplica linha", iguais(repetido, so1));

    // ── 4. isolamento entre usuários ────────────────────────────────────────
    const deB = await idsDe([p3.projetoId], usuarioB.id, true);
    check("B vê o documento do projeto dele", iguais(deB, [p3.documentoId]));
    check(
      "o escopo de A não contém nenhum documento de B",
      multi.every((id) => !deB.includes(id)),
    );
    // O teste que importa: mesmo pedindo o projeto de B explicitamente, A não pode ver o
    // documento — quem monta o escopo é `escopoProjeto(user)`, e este smoke prova que passar o
    // id sozinho não basta quando a muralha por disciplina está ligada.
    const aPedindoP3 = await idsDe([p3.projetoId], usuarioA.id, false);
    check("A pedindo o projeto de B, com muralha ligada, não vê nada", aPedindoP3.length === 0);

    // ── 5. muralha por disciplina junto com escopo de vários projetos ───────
    const comMuralha = await idsDe([p1.projetoId, p2.projetoId], usuarioA.id, false);
    check(
      "com veTodas=false, A só vê a disciplina onde é responsável (P1), não P2",
      iguais(comMuralha, [p1.documentoId]),
      `${comMuralha.length} de ${multi.length}`,
    );
  } finally {
    // Limpeza: cascata do Projeto leva disciplina, documento e upload.
    for (const c of criados) {
      await prisma.projeto.deleteMany({ where: { id: c.projetoId } });
      await prisma.cliente.deleteMany({ where: { id: c.clienteId } });
    }
    if (usuarios.length) await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  }

  console.log(ok ? "\nSmoke de escopo: OK" : "\nSmoke de escopo: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
