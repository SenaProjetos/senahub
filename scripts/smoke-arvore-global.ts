/**
 * Smoke da árvore do diretório geral (`arvoreGlobalArquivos`), contra o banco de dev.
 *
 * Duas coisas que o vitest não alcança (o módulo puro `arvore-global.ts` já está coberto lá):
 *
 *  1. AS CONTAGENS DE ÁREA REPRODUZEM A DEFINIÇÃO ORIGINAL. A árvore agrega no banco, uma
 *     consulta por área sobre o escopo inteiro, porque fazer como a aba do projeto faz seriam
 *     cinco consultas POR projeto. Aqui o resultado é conferido contra as consultas por projeto
 *     de verdade (`recebidosDoProjeto` e companhia), projeto a projeto, no dado real do dev.
 *     Recebidos é o caso delicado: soma material externo ancorado no projeto OU na proposta,
 *     mais os docs do Geral marcados `exibirEmRecebidos`.
 *
 *  2. ESCOPO E MURALHA. Com dados throwaway: projeto de outra pessoa não entra, disciplina onde
 *     não sou responsável some com `veTodas=false`, e disciplina de aprovação/laudo mostra a
 *     árvore de PastaProjeto em vez de fase → formato.
 *
 * Uso: npm run smoke:arvore-global
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { arvoreGlobalArquivos } from "../src/modules/arquivos/arvore-global-queries";
import {
  baseArquitetonicaDoProjeto,
  geralDoProjeto,
  recebidosDoProjeto,
} from "../src/modules/documentos-cliente/queries";
import { listarArtsDoProjeto } from "../src/modules/projetos/art/queries";
import { lixeiraDoProjeto } from "../src/modules/uploads/queries";
import { chaveDocumento } from "../src/modules/uploads/documento";
import type { SessionUser } from "../src/lib/session";
import type { NoAnoGlobal } from "../src/modules/arquivos/arvore-global";

const TAG = `SMKARV_${Date.now()}`;
const TUDO_VISIVEL = { geral: true, lixeira: true, gerirRecebidos: true };

function projetosDe(arvore: NoAnoGlobal[]) {
  return new Map(arvore.flatMap((a) => a.projetos).map((p) => [p.projetoId, p]));
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

  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true } });
  if (!admin) throw new Error("Banco de dev sem admin.");

  // ── 1. contagens de área × consultas por projeto, no dado real ────────────
  const arvoreReal = await arvoreGlobalArquivos(admin as unknown as SessionUser, true, TUDO_VISIVEL);
  const naArvore = projetosDe(arvoreReal);
  const projetosReais = await prisma.projeto.findMany({ select: { id: true, codigo: true }, orderBy: { codigo: "asc" } });

  let divergencias = 0;
  for (const p of projetosReais) {
    const [rec, base, ger, arts, lix] = await Promise.all([
      recebidosDoProjeto(p.id, { incluirCompartilhadosDoGeral: true }),
      baseArquitetonicaDoProjeto(p.id),
      geralDoProjeto(p.id),
      listarArtsDoProjeto(p.id),
      lixeiraDoProjeto(p.id),
    ]);
    const esperado: Record<string, number> = {
      recebidos: rec.length,
      base: base.length,
      geral: ger.length,
      arts: arts.length,
      lixeira: lix.length,
    };
    const areas = new Map((naArvore.get(p.id)?.areas ?? []).map((a) => [a.area as string, a.total]));
    for (const [area, n] of Object.entries(esperado)) {
      const obtido = areas.get(area) ?? 0;
      if (obtido !== n) {
        divergencias++;
        console.log(`  ${p.codigo} ${area}: por-projeto=${n} árvore=${obtido}`);
      }
    }
  }
  check(
    "contagem de área bate com as consultas por projeto",
    divergencias === 0,
    `${projetosReais.length} projeto(s) × 5 áreas, ${divergencias} divergência(s)`,
  );
  check("anos vêm do mais recente para o mais antigo", arvoreReal.every((a, i, xs) => i === 0 || xs[i - 1].ano > a.ano));
  check(
    "projetos vêm na sequência do código dentro do ano",
    arvoreReal.every((a) => a.projetos.every((p, i, xs) => i === 0 || xs[i - 1].codigo <= p.codigo)),
  );

  // ── 2. escopo, muralha e pastas, com dados throwaway ──────────────────────
  const criados: { clienteId: string; projetoId: string }[] = [];
  const usuarios: string[] = [];
  try {
    const dono = await prisma.user.create({
      data: { name: `${TAG}_dono`, email: `${TAG.toLowerCase()}_dono@smoke.local`, role: "projetista_pj", ativo: true },
    });
    const estranho = await prisma.user.create({
      data: { name: `${TAG}_fora`, email: `${TAG.toLowerCase()}_fora@smoke.local`, role: "projetista_pj", ativo: true },
    });
    usuarios.push(dono.id, estranho.id);

    const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${TAG}_cli` } });
    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: {
          ano, sequencial, codigo, tipo: "particular", nome: `${TAG}_proj`, clienteId: cliente.id,
          membros: { create: [{ userId: dono.id, papel: "coordenador" }] },
          disciplinas: {
            create: [
              { disciplinaTextoLegado: "Estrutural", ordem: 0, responsaveis: { create: [{ userId: dono.id }] } },
              { disciplinaTextoLegado: "Aprovação", ordem: 1 },
            ],
          },
        },
        include: { disciplinas: { orderBy: { ordem: "asc" } } },
      });
    });
    criados.push({ clienteId: cliente.id, projetoId: projeto.id });
    const [dComum, dPastas] = projeto.disciplinas.map((d) => d.id);

    const criarDoc = async (disciplinaId: string, chave: string, nome: string, pastaId?: string) => {
      const doc = await prisma.documentoDisciplina.create({ data: { disciplinaId, chave, nomeArquivo: nome } });
      await prisma.upload.create({
        data: {
          disciplinaId, documentoId: doc.id,
          pacote: pastaId ? null : "A",
          pastaId,
          nomeArquivo: nome,
          caminho: `${TAG}/${nome}`,
          hashSha256: `${TAG}${nome}`.padEnd(64, "0").slice(0, 64),
          tamanho: 256, autorId: dono.id,
        },
      });
      return doc.id;
    };

    await criarDoc(dComum, `A/${TAG}-comum`, `${TAG}-comum.pdf`);

    // `origem: "template"` é o que faz `disciplinaUsaPastas` valer — pasta custom sozinha não.
    const raiz = await prisma.pastaProjeto.create({
      data: { disciplinaId: dPastas, nome: "Prefeitura", caminho: "prefeitura", origem: "template", ordem: 0 },
    });
    const filha = await prisma.pastaProjeto.create({
      data: { disciplinaId: dPastas, parentId: raiz.id, nome: "Protocolo", caminho: "prefeitura/protocolo", origem: "template", ordem: 0 },
    });
    await criarDoc(dPastas, chaveDocumento({ pacote: null, pastaId: filha.id, nomeArquivo: `${TAG}-prot.pdf` }), `${TAG}-prot.pdf`, filha.id);

    const doDono = projetosDe(await arvoreGlobalArquivos(dono as unknown as SessionUser, true, TUDO_VISIVEL));
    const noDono = doDono.get(projeto.id);
    check("o dono vê o projeto dele na árvore", !!noDono);
    check("as duas disciplinas com documento aparecem", (noDono?.disciplinas.length ?? 0) === 2, `${noDono?.disciplinas.length ?? 0}`);

    const aprovacao = noDono?.disciplinas.find((d) => d.rotulo === "Aprovação");
    check("disciplina de aprovação vem como árvore de pastas", aprovacao?.formato === "pastas");
    if (aprovacao?.formato === "pastas") {
      check("a pasta raiz acumula o documento da subpasta", aprovacao.pastas[0]?.total === 1, `${aprovacao.pastas[0]?.total}`);
      check("a subpasta aparece dentro da raiz", aprovacao.pastas[0]?.filhos[0]?.rotulo === "Protocolo");
    }
    check("o total do projeto conta documentos das duas disciplinas", noDono?.total === 2, `${noDono?.total}`);

    const deFora = projetosDe(await arvoreGlobalArquivos(estranho as unknown as SessionUser, true, TUDO_VISIVEL));
    check("quem está fora do projeto não o vê na árvore", !deFora.has(projeto.id));

    const comMuralha = projetosDe(await arvoreGlobalArquivos(dono as unknown as SessionUser, false, TUDO_VISIVEL));
    const noMuralha = comMuralha.get(projeto.id);
    check(
      "com veTodas=false só entra a disciplina onde o dono é responsável",
      noMuralha?.disciplinas.length === 1 && noMuralha.disciplinas[0].rotulo === "Estrutural",
      `${noMuralha?.disciplinas.length ?? 0} disciplina(s)`,
    );

    const semAreas = projetosDe(
      await arvoreGlobalArquivos(dono as unknown as SessionUser, true, { geral: false, lixeira: false, gerirRecebidos: false }),
    );
    check(
      "área sem permissão não entra na árvore",
      !(semAreas.get(projeto.id)?.areas ?? []).some((a) => a.area === "geral" || a.area === "lixeira"),
    );
  } finally {
    for (const c of criados) {
      await prisma.projeto.deleteMany({ where: { id: c.projetoId } });
      await prisma.cliente.deleteMany({ where: { id: c.clienteId } });
    }
    if (usuarios.length) await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  }

  console.log(ok ? "\nSmoke da árvore global: OK" : "\nSmoke da árvore global: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
