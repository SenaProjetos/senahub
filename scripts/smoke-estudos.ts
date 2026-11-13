/**
 * Smoke da aba Estudos (Lote 5d, spec 2026-11-02-lote5d-estudos-design.md) contra o banco de dev.
 * O vitest cobre as regras puras e o service com banco falso; aqui vai o SQL de verdade: criar, salvar com
 * trava otimista (conflito e corrida de dois cliques), `updatedAt`, duplicar, limite por projeto, memória
 * exportável, excluir, cascata ao apagar o projeto, escopo de projeto (quem enxerga/edita) e a trava de
 * validação do motor.
 *
 * Cria cliente + projeto + usuários throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:estudos
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { projetoVisivel } from "../src/modules/planejamento/queries";
import { calcularEstudo } from "../src/modules/estudos/calculo";
import { conteudoSchema, lerConteudo, MAX_ESTUDOS_POR_PROJETO, type ConteudoEstudo } from "../src/modules/estudos/conteudo";
import { MOTIVO_ALTERADO_POR_OUTRA_PESSOA, MOTIVO_SEM_EDICAO, situacaoDoMotor } from "../src/modules/estudos/acesso";
import { memoriaDoEstudo } from "../src/modules/estudos/memoria";
import { estudoDoProjeto, estudosDoProjeto, liberacaoDosEstudos, podeEditarEstudosDoProjeto } from "../src/modules/estudos/queries";
import {
  MOTIVO_ESTUDO_INEXISTENTE,
  MOTIVO_LIMITE_DE_ESTUDOS,
  MOTIVO_NAO_LIBERADO,
  criarEstudo,
  duplicarEstudo,
  excluirEstudo,
  salvarEstudo,
} from "../src/modules/estudos/service";
import type { SessionUser } from "../src/lib/session";

const carga = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  descricao: `carga ${id}`,
  quantidade: 1,
  potenciaW: 100,
  fp: 1,
  rendimento: 1,
  fd: 1,
  tensaoV: 127,
  ligacao: "mono",
  ...over,
});

function conteudoDeTeste(): ConteudoEstudo {
  return conteudoSchema.parse({
    ambientes: [
      { id: "a1", nome: "Sala", cargas: [carga("c1", { quantidade: 4, potenciaW: 10, tipoPonto: "iluminacao" }), carga("c2", { quantidade: 2, fd: 0.5 })] },
      { id: "a2", nome: "Banheiro", cargas: [carga("c3", { descricao: "chuveiro", potenciaW: 5500, tensaoV: 220 })] },
    ],
    condicoes: {},
    fonteFatorDemanda: "Tabela de demanda de teste",
  });
}

async function main() {
  const tag = `SMKEST_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };
  const erroDe = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const adminDb = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true, tipo: "interno" }, select: { id: true } });
  if (!adminDb) throw new Error("Banco de dev sem superusuário interno ativo.");
  const admin = { id: adminDb.id, tipo: "interno", superUsuario: true, ativo: true } as unknown as SessionUser;

  const novoUsuario = (sufixo: string) =>
    prisma.user.create({
      data: { name: `${tag}_${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno", contratacao: "pj", perfil: { connect: { chave: "projetista_pj" } }, ativo: true },
    });
  const resp = await novoUsuario("resp");
  const leitor = await novoUsuario("leitor");
  const fora = await novoUsuario("fora");
  const comoSessao = (u: object) => u as unknown as SessionUser;

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id,
        membros: { create: [{ userId: leitor.id, papel: "projetista" }] },
        disciplinas: { create: [{ disciplinaTextoLegado: "Elétrico", ordem: 0, responsaveis: { create: [{ userId: resp.id }] } }] },
      },
    });
  });

  try {
    // 1) Criar
    const c = await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} Casa` });
    const criado = await estudoDoProjeto(projeto.id, c.id);
    check("criar: estudo nasce vazio, versão 1, tipo de cargas", !!criado && criado.versao === 1 && criado.tipo === "cargas_eletricas" && criado.conteudo?.ambientes.length === 0);

    // 2) Salvar e reler
    const t0 = (await prisma.estudoProjeto.findUniqueOrThrow({ where: { id: c.id }, select: { updatedAt: true } })).updatedAt;
    await new Promise((r) => setTimeout(r, 15));
    const conteudo = conteudoDeTeste();
    const s = await salvarEstudo(admin, { id: c.id, versao: 1, nome: `${tag} Casa 2`, conteudo });
    check("salvar: devolve a versão 2", s.versao === 2);
    const relido = await estudoDoProjeto(projeto.id, c.id);
    check("salvar: nome e conteúdo relidos iguais ao enviado", relido?.nome === `${tag} Casa 2` && JSON.stringify(relido?.conteudo) === JSON.stringify(conteudo));
    const t1 = (await prisma.estudoProjeto.findUniqueOrThrow({ where: { id: c.id }, select: { updatedAt: true } })).updatedAt;
    check("salvar: updatedAt avança (updateMany grava @updatedAt)", t1.getTime() > t0.getTime());
    const calc = relido?.tipo === "cargas_eletricas" && relido.conteudo ? calcularEstudo(relido.conteudo) : null;
    // 40 + 100 (2 × 100 × 0,5) + 5500 W demandados
    check("conta do conteúdo gravado: demanda 5640 W", Math.abs((calc?.total?.pDemandadaW ?? 0) - 5640) < 1e-6, `${calc?.total?.pDemandadaW}`);

    // 3) Conflito de versão
    const antigo = await erroDe(salvarEstudo(admin, { id: c.id, versao: 1, nome: "Perdido", conteudo }));
    check("conflito: salvar com a versão velha é recusado com a explicação", antigo === MOTIVO_ALTERADO_POR_OUTRA_PESSOA, antigo ?? "sem erro");
    check("conflito: nada foi gravado", (await estudoDoProjeto(projeto.id, c.id))?.nome === `${tag} Casa 2`);

    // 4) Corrida: dois cliques com a mesma versão → só um grava
    const corrida = await Promise.allSettled([
      salvarEstudo(admin, { id: c.id, versao: 2, nome: `${tag} A`, conteudo }),
      salvarEstudo(admin, { id: c.id, versao: 2, nome: `${tag} B`, conteudo }),
    ]);
    check("corrida: exatamente um dos dois salva", corrida.filter((r) => r.status === "fulfilled").length === 1);
    check("corrida: versão final = 3", (await estudoDoProjeto(projeto.id, c.id))?.versao === 3);

    // 5) Duplicar
    const d = await duplicarEstudo(admin, { id: c.id });
    const copia = await estudoDoProjeto(projeto.id, d.id);
    const origem = await estudoDoProjeto(projeto.id, c.id);
    check("duplicar: cópia com '(cópia)', versão 1 e o mesmo conteúdo", !!copia && copia.nome.endsWith("(cópia)") && copia.versao === 1 && JSON.stringify(copia.conteudo) === JSON.stringify(origem?.conteudo));

    // 6) Lista e resumo
    const lista = await estudosDoProjeto(projeto.id);
    const resumo = lista.find((e) => e.id === c.id);
    check("lista: 2 estudos; resumo com 2 ambientes, 3 cargas e 5,64 kW", lista.length === 2 && resumo?.ambientes === 2 && resumo?.cargas === 3 && Math.abs((resumo?.demandaKw ?? 0) - 5.64) < 1e-6);

    // 7) Escopo: o recorte por projeto vale na leitura
    check("leitura: id de estudo de OUTRO projeto não abre por este projeto", (await estudoDoProjeto("projeto-que-nao-existe", c.id)) === null);

    // 8) Memória exportável
    const mem = await memoriaDoEstudo(admin, c.id);
    const emValidacao = situacaoDoMotor() === "em_validacao";
    check("memória: montada, com a seção da fonte dos fatores", !!mem && mem.tipo === "cargas_eletricas" && mem.doc.secoes.some((x) => x.titulo.startsWith("Origem dos fatores")));
    check("memória: selo de validação segue o registro do motor", ((mem?.tipo === "cargas_eletricas" ? mem.doc.subtitulo : "") ?? "").includes("EM VALIDAÇÃO") === emValidacao);
    const vazio = await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} vazio` });
    check("memória: estudo sem cargas não exporta", (await memoriaDoEstudo(admin, vazio.id)) === null);
    await excluirEstudo(admin, { id: vazio.id });

    // 8b) Relatório do estudo de cargas e demanda: mesmo com o estudo vazio, sai com as 7 seções da spec §7.
    const cd = await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} cargas e demanda`, tipo: "cargas_demanda" });
    const rel = await memoriaDoEstudo(admin, cd.id);
    check("relatório de cargas e demanda: 7 seções e marca de não conferido", rel?.tipo === "cargas_demanda" && rel.relatorio.secoes.length === 7 && rel.relatorio.naoConferido);
    await excluirEstudo(admin, { id: cd.id });

    // 9) Limite por projeto
    const atuais = await prisma.estudoProjeto.count({ where: { projetoId: projeto.id } });
    for (let i = atuais; i < MAX_ESTUDOS_POR_PROJETO; i++) await criarEstudo(admin, { projetoId: projeto.id, nome: `${tag} #${i}` });
    check("limite: o 21º estudo é recusado", (await erroDe(criarEstudo(admin, { projetoId: projeto.id, nome: "a mais" }))) === MOTIVO_LIMITE_DE_ESTUDOS);
    check("limite: duplicar também é recusado", (await erroDe(duplicarEstudo(admin, { id: c.id }))) === MOTIVO_LIMITE_DE_ESTUDOS);

    // 10) Quem enxerga e quem edita (escopo de projeto)
    check("escopo: membro do projeto enxerga", !!(await projetoVisivel(comoSessao(leitor), projeto.id)));
    check("escopo: responsável de disciplina enxerga", !!(await projetoVisivel(comoSessao(resp), projeto.id)));
    check("escopo: quem não participa NÃO enxerga", (await projetoVisivel(comoSessao(fora), projeto.id)) === null);
    check("edição: responsável de disciplina pode", await podeEditarEstudosDoProjeto(comoSessao(resp), projeto.id));
    check("edição: membro que não é responsável NÃO pode", !(await podeEditarEstudosDoProjeto(comoSessao(leitor), projeto.id)));
    check("edição: quem não participa NÃO pode", !(await podeEditarEstudosDoProjeto(comoSessao(fora), projeto.id)));

    // 11) Trava de validação do motor, vista por quem não gere as ferramentas
    const lib = await liberacaoDosEstudos(comoSessao(resp));
    check("validação: liberação do responsável segue o registro do motor", lib.liberado === !emValidacao && lib.emValidacao === emValidacao);
    check("validação: o superusuário (gere as ferramentas) sempre vê", (await liberacaoDosEstudos(admin)).liberado);
    const doResp = await erroDe(criarEstudo(comoSessao(resp), { projetoId: projeto.id, nome: "x" }));
    const doLeitor = await erroDe(criarEstudo(comoSessao(leitor), { projetoId: projeto.id, nome: "x" }));
    const doFora = await erroDe(criarEstudo(comoSessao(fora), { projetoId: projeto.id, nome: "x" }));
    if (emValidacao) {
      check("validação: com o motor em validação, quem não gere é recusado (mesmo o responsável)", doResp === MOTIVO_NAO_LIBERADO && doLeitor === MOTIVO_NAO_LIBERADO && doFora === MOTIVO_NAO_LIBERADO, `${doResp} | ${doLeitor} | ${doFora}`);
    } else {
      // Limite já atingido acima: o responsável passa pelas travas de acesso e só esbarra no limite.
      check("escrita: responsável passa pelo acesso (cai no limite)", doResp === MOTIVO_LIMITE_DE_ESTUDOS, `${doResp}`);
      check("escrita: membro não responsável é recusado", doLeitor === MOTIVO_SEM_EDICAO, `${doLeitor}`);
      check("escrita: quem não participa é recusado", doFora !== null && doFora !== MOTIVO_LIMITE_DE_ESTUDOS, `${doFora}`);
    }

    // 12) Excluir
    await excluirEstudo(admin, { id: d.id });
    check("excluir: some do banco", (await prisma.estudoProjeto.count({ where: { id: d.id } })) === 0);
    check("excluir: de novo → 'não encontrado'", (await erroDe(excluirEstudo(admin, { id: d.id }))) === MOTIVO_ESTUDO_INEXISTENTE);

    // 13) Conteúdo ilegível não derruba a leitura
    await prisma.estudoProjeto.update({ where: { id: c.id }, data: { conteudo: { ambientes: "quebrado" } } });
    const quebrado = await estudoDoProjeto(projeto.id, c.id);
    check("conteúdo ilegível: a leitura devolve o estudo com conteudo = null", !!quebrado && quebrado.conteudo === null && lerConteudo({ x: 1 }) === null);
    const naLista = (await estudosDoProjeto(projeto.id)).find((e) => e.id === c.id);
    check("conteúdo ilegível: a lista mostra o estudo sem totais", !!naLista && naLista.cargas === null && naLista.demandaKw === null);
  } finally {
    // 14) Cascata e limpeza
    const antes = await prisma.estudoProjeto.count({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } }).catch((e) => console.error("limpeza do projeto:", e));
    const depois = await prisma.estudoProjeto.count({ where: { projetoId: projeto.id } });
    check("cascata: apagar o projeto leva os estudos junto", antes > 0 && depois === 0, `${antes} → ${depois}`);
    await prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [resp.id, leitor.id, fora.id] } } }).catch((e) => console.error("limpeza dos usuários:", e));
  }

  console.log(ok ? "\nTUDO CERTO" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
