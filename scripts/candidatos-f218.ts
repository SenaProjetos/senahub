/**
 * Candidatos para as duas lacunas da F2.18. SOMENTE LEITURA.
 *
 * (1) Dois leads estão SEM CLIENTE, e `Negociacao.clienteId` é NOT NULL — sem empresa não há
 *     negociação possível. Lista as empresas cujo nome se aproxima, para escolher.
 * (2) Seis leads estão em "Contratado". Se o contrato virou obra, existe um `Projeto` por trás —
 *     e `Projeto.negociacaoId` (F2.4) é o campo que amarra os dois. Lista os projetos de cada
 *     empresa para conferir se há correspondência.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const ORFAOS = [
  { lead: "EDIF. MARMARES - ORÇ E CFF", chute: "marmares" },
  { lead: "CAPIBA MALL", chute: "capiba" },
];

(async () => {
  console.log("=== (1) Leads sem empresa: candidatos ===\n");
  for (const o of ORFAOS) {
    console.log(`─ "${o.lead}"`);
    const porNome = await prisma.$queryRawUnsafe<{ id: string; nome: string; n: bigint }[]>(
      `SELECT c.id, c.nome, (SELECT count(*) FROM projeto p WHERE p."clienteId" = c.id) AS n
         FROM cliente c
        WHERE c."fundidoEmId" IS NULL AND c."excluidoEm" IS NULL
        ORDER BY c.nome`,
    );
    // Mostra só os que compartilham alguma palavra com o nome do lead, senão são 41 linhas.
    const palavras = o.lead.toLowerCase().split(/[^a-zà-ú]+/).filter((p) => p.length > 3);
    const provaveis = porNome.filter((c) =>
      palavras.some((p) => c.nome.toLowerCase().includes(p)),
    );
    if (provaveis.length === 0) {
      console.log(`   (nenhuma empresa com nome parecido — escolher da lista completa)`);
    }
    for (const c of provaveis) console.log(`   ${c.nome}  [${c.id}]  ${Number(c.n)} projeto(s)`);
    console.log("");
  }

  console.log("=== (2) Projetos por empresa dos leads Contratado ===\n");
  const empresas = await prisma.$queryRawUnsafe<{ id: string; nome: string }[]>(
    `SELECT DISTINCT c.id, c.nome FROM lead l JOIN cliente c ON c.id = l."clienteId"
      WHERE l."clienteId" IS NOT NULL ORDER BY c.nome`,
  );
  for (const e of empresas) {
    const projs = await prisma.projeto.findMany({
      where: { clienteId: e.id },
      select: { codigo: true, nome: true, situacao: true, negociacaoId: true },
      orderBy: { codigo: "asc" },
    });
    console.log(`─ ${e.nome}: ${projs.length} projeto(s)`);
    for (const p of projs) {
      console.log(`   ${p.codigo}  ${p.nome}  [${p.situacao}]${p.negociacaoId ? "  (ja tem negociacao)" : ""}`);
    }
    console.log("");
  }

  const semNeg = await prisma.projeto.count({ where: { negociacaoId: null } });
  const tot = await prisma.projeto.count();
  console.log(`projetos sem negociacao vinculada: ${semNeg} de ${tot}`);
  await prisma.$disconnect();
})();
