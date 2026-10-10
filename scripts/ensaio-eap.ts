/**
 * Ensaio da EAP no banco de DEV (reunião de 08/10/2026, item 13): monta um projeto parecido com o Arapiraca —
 * Residencial multifamiliar, disciplinas Estrutural e Elétrico, etapas EP/Básico/Executivo com início e fim, EAP com
 * pessoas atribuídas, cronograma APROVADO e cards gerados — mais um usuário de teste por perfil, para ver o ponto, o
 * Meu trabalho, o card da disciplina e o aviso da etapa que vem antes de mexer no projeto de verdade.
 *
 * O cronograma começa há 3 semanas de propósito: as atividades do Estudo Preliminar já passaram do término (para ver o
 * vermelho, a atrasada no ponto e no Meu trabalho) e o Básico está em andamento.
 *
 * Idempotente: `--refazer` apaga o projeto do ensaio (e só ele) e monta de novo. Recusa banco que não pareça de dev.
 *
 * Usuários (senha Demo@2026): ensaio.clt@ · ensaio.estagiario@ · ensaio.pj@ · ensaio.coord@ (@demo.senahub).
 *
 * Uso: npm run ensaio:eap [-- --refazer]
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { TERMOS } from "../src/modules/legal/termos";
import { auth } from "../src/lib/auth";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { semearEtapasPadrao, sincronizarPrazoDisciplina } from "../src/modules/projetos/etapas-service";
import { aprovarCronograma } from "../src/modules/planejamento/service";
import { reagendarProjeto } from "../src/modules/planejamento/agenda";
import { sincronizarCards } from "../src/modules/planejamento/recursos-service";

const SENHA = "Demo@2026";
const NOME = "ENSAIO · Arapiraca (teste)";
const CLIENTE = "ENSAIO · cliente de teste";
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function garantirAmbienteDev() {
  const url = process.env.DATABASE_URL ?? "";
  let nome = "";
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    /* cai na recusa abaixo */
  }
  if (!/(_remake|_dev|_test|_vscode)$/i.test(nome) || process.env.NODE_ENV === "production") {
    throw new Error(`RECUSADO: o banco "${nome}" não parece de DEV. O ensaio cria usuários e projeto de teste.`);
  }
}

/**
 * Sem perfil de acesso (`perfilId`), contratação, setor e tipo o usuário não tem permissão nenhuma: o login funciona e
 * toda tela devolve /sem-permissao. Por isso cada pessoa de teste leva o MESMO conjunto dos usuários do `seed:demo`.
 */
const PERFIL: Record<string, { perfil: string; contratacao: string }> = {
  clt: { perfil: "CLT", contratacao: "clt" },
  estagiario: { perfil: "Estagiário", contratacao: "estagio" },
  projetista_pj: { perfil: "Projetista PJ", contratacao: "pj" },
  supervisor: { perfil: "Coordenador", contratacao: "clt" },
};

async function usuario(name: string, email: string, role: "clt" | "estagiario" | "projetista_pj" | "supervisor") {
  const existe = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  let id = existe?.id;
  if (!id) {
    const ctx = await auth.$context;
    const u = await prisma.user.create({
      data: { name, email, emailVerified: true, role, ativo: true, mustChangePassword: false },
    });
    await prisma.account.create({
      data: { userId: u.id, providerId: "credential", accountId: u.id, password: await ctx.password.hash(SENHA) },
    });
    id = u.id;
  }
  const alvo = PERFIL[role];
  const perfil = await prisma.perfilAcesso.findFirst({ where: { nome: alvo.perfil }, select: { id: true } });
  if (!perfil) throw new Error(`Perfil de acesso "${alvo.perfil}" não existe no banco de dev — rode \`npm run db:seed\`.`);
  await prisma.user.update({
    where: { id },
    data: { perfilId: perfil.id, contratacao: alvo.contratacao as never, setor: "engenharia" as never, tipo: "interno" as never },
  });
  // Sem o aceite do termo vigente o login cai em /termo e a pessoa de teste não chega a tela nenhuma.
  const termo = TERMOS.colaborador;
  await prisma.aceiteTermo.upsert({
    where: { userId_tipo_versao: { userId: id, tipo: "colaborador", versao: termo.versao } },
    create: { userId: id, tipo: "colaborador", versao: termo.versao, conteudoHash: createHash("sha256").update(termo.conteudo).digest("hex") },
    update: {},
  });
  return id;
}

async function apagarEnsaio() {
  const projetos = await prisma.projeto.findMany({ where: { nome: NOME }, select: { id: true } });
  for (const { id } of projetos) {
    await prisma.tarefa.deleteMany({ where: { projetoId: id } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: id } });
    await prisma.disciplinaEtapa.deleteMany({ where: { disciplina: { projetoId: id } } });
    await prisma.disciplina.deleteMany({ where: { projetoId: id } });
    await prisma.projetoMembro.deleteMany({ where: { projetoId: id } });
    await prisma.projeto.delete({ where: { id } });
  }
  return projetos.length;
}

async function main() {
  garantirAmbienteDev();
  if (process.argv.includes("--refazer")) console.log(`Projeto(s) do ensaio apagado(s): ${await apagarEnsaio()}.`);
  if (await prisma.projeto.findFirst({ where: { nome: NOME }, select: { id: true } })) {
    console.log("O projeto do ensaio já existe. Use --refazer para montar de novo.");
    return;
  }

  const [clt, estagiario, pj, coord] = await Promise.all([
    usuario("Ensaio CLT", "ensaio.clt@demo.senahub", "clt"),
    usuario("Ensaio Estagiário", "ensaio.estagiario@demo.senahub", "estagiario"),
    usuario("Ensaio PJ", "ensaio.pj@demo.senahub", "projetista_pj"),
    usuario("Ensaio Coordenação", "ensaio.coord@demo.senahub", "supervisor"),
  ]);
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin", ativo: true }, select: { id: true } });
  const cliente =
    (await prisma.cliente.findFirst({ where: { nome: CLIENTE }, select: { id: true } })) ??
    (await prisma.cliente.create({ data: { nome: CLIENTE }, select: { id: true } }));
  const tipo = await prisma.tipoEmpreendimento.findFirst({ where: { nome: { contains: "multifamiliar", mode: "insensitive" } }, select: { id: true } });
  const catalogo = await prisma.disciplinaCatalogo.findMany({
    where: { nome: { in: ["Estrutural", "Elétrico"] } },
    select: { id: true, nome: true },
  });
  const fases = await prisma.pranchaCatalogo.findMany({ where: { categoria: "fase", projetoId: null, sigla: { in: ["PL", "BS", "EX"] } }, select: { id: true, sigla: true } });
  const fase = (s: string) => fases.find((f) => f.sigla === s)!.id;
  const status = await prisma.tarefaStatus.findFirst({ where: { ativo: true }, select: { id: true } });
  if (!status || fases.length < 3) throw new Error("Banco de dev sem status de tarefa ou sem as fases PL/BS/EX — rode `npm run db:seed`.");

  const inicioProjeto = dia(-21); // 3 semanas atrás: o Estudo Preliminar já passou do término
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    const p = await tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: NOME,
        clienteId: cliente.id,
        tipoEmpreendimentoId: tipo?.id ?? null,
        prazoContrato: d(dia(120)),
        prazoPlanejado: d(dia(120)),
        membros: { create: [{ userId: coord, papel: "Coordenador" }, { userId: clt }, { userId: estagiario }, { userId: pj }] },
      },
    });
    const criadas = new Map<string, string>();
    for (const [i, nome] of ["Estrutural", "Elétrico"].entries()) {
      const disc = await tx.disciplina.create({
        data: {
          projetoId: p.id,
          disciplinaTextoLegado: nome,
          disciplinaId: catalogo.find((c) => c.nome === nome)?.id ?? null,
          ordem: i,
          responsaveis: { create: (nome === "Estrutural" ? [clt, estagiario] : [pj]).map((userId) => ({ userId })) },
        },
      });
      criadas.set(nome, disc.id);
    }
    await semearEtapasPadrao(tx, [...criadas.values()], { tipoProjeto: "particular", tipoEmpreendimentoId: tipo?.id ?? null });
    // Percentuais e datas das etapas (início e fim) — como a coordenação preencheria.
    const datas: Record<string, [string, string, number]> = { PL: [dia(-21), dia(-8), 20], BS: [dia(-7), dia(21), 40], EX: [dia(22), dia(70), 40] };
    for (const [sigla, [inicio, prazo, percentual]] of Object.entries(datas)) {
      await tx.disciplinaEtapa.updateMany({
        where: { disciplinaId: { in: [...criadas.values()] }, etapaId: fase(sigla) },
        data: { inicio: d(inicio), prazo: d(prazo), percentual },
      });
    }
    // O prazo da disciplina é o maior prazo das etapas — como a tela de etapas deixa.
    for (const id of criadas.values()) await sincronizarPrazoDisciplina(tx, id);
    await tx.cronogramaProjeto.create({ data: { projetoId: p.id, inicioProjeto: d(inicioProjeto) } });
    return { ...p, criadas };
  });

  // EAP: disciplina → atividades por fase, encadeadas (FS) dentro da disciplina.
  let ordem = 0;
  const plano: Record<string, { fase: string; nomes: string[] }[]> = {
    Estrutural: [
      { fase: "PL", nomes: ["Lançamento do estudo estrutural"] },
      { fase: "BS", nomes: ["Modelagem estrutural", "Análise interna", "Documentação do básico"] },
      { fase: "EX", nomes: ["Detalhamento executivo"] },
    ],
    Elétrico: [
      { fase: "PL", nomes: ["Estudo de cargas"] },
      { fase: "BS", nomes: ["Modelagem elétrica", "Documentação do básico elétrico"] },
      { fase: "EX", nomes: ["Detalhamento elétrico executivo"] },
    ],
  };
  const pessoasDe: Record<string, string[]> = { Estrutural: [clt, estagiario], Elétrico: [pj] };
  for (const [disciplina, fasesDaDisc] of Object.entries(plano)) {
    const discId = projeto.criadas.get(disciplina)!;
    const pai = await prisma.eapTarefa.create({
      data: { projetoId: projeto.id, disciplinaId: discId, nome: disciplina, tipoEap: "disc", ordem: ordem++, inicioPrevisto: d(inicioProjeto), fimPrevisto: d(inicioProjeto) },
    });
    let anterior: string | null = null;
    for (const f of fasesDaDisc) {
      for (const nome of f.nomes) {
        const l = await prisma.eapTarefa.create({
          data: {
            projetoId: projeto.id,
            parentId: pai.id,
            disciplinaId: discId,
            etapaId: fase(f.fase),
            nome,
            tipoEap: "atv",
            duracaoDias: 5,
            ordem: ordem++,
            inicioPrevisto: d(inicioProjeto),
            fimPrevisto: d(inicioProjeto),
          },
        });
        if (anterior) await prisma.eapDependencia.create({ data: { tarefaId: l.id, predecessoraId: anterior } });
        await prisma.eapAtribuicao.createMany({
          data: pessoasDe[disciplina].map((userId, i) => ({
            tarefaId: l.id,
            userId,
            papel: userId === estagiario ? ("est" as const) : ("pro" as const),
            horasPrevistas: 20,
            principal: i === 0,
          })),
        });
        anterior = l.id;
      }
    }
  }
  // Identidade corporativa das linhas (a EAP exige) e datas pelo motor.
  const semId = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id, idCorporativo: null }, orderBy: { ordem: "asc" }, select: { id: true, tipoEap: true } });
  const novos = await reservarIdsParaLinhas(prisma, semId.map((l) => l.tipoEap));
  for (const [i, l] of semId.entries()) await prisma.eapTarefa.update({ where: { id: l.id }, data: { idCorporativo: novos[i] } });

  await reagendarProjeto(projeto.id, admin.id);
  let aprovado = true;
  try {
    const r = await aprovarCronograma(projeto.id, admin.id);
    console.log(`Cronograma aprovado: ${r.cardsCriados} card(s) criado(s).`);
  } catch (e) {
    aprovado = false;
    console.log(`Cronograma NÃO aprovado (${e instanceof Error ? e.message : e}). O projeto ficou em rascunho.`);
    await sincronizarCards(prisma, projeto.id, admin.id);
  }

  console.log(`\nProjeto do ensaio: ${NOME} (${projeto.codigo}) — ${aprovado ? "cronograma aprovado" : "rascunho"}.`);
  console.log(`  /projetos/${projeto.id}  ·  /planejamento/${projeto.id}`);
  console.log("Usuários (senha Demo@2026): ensaio.clt@ · ensaio.estagiario@ · ensaio.pj@ · ensaio.coord@ demo.senahub");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
