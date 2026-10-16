/**
 * Smoke das pendências documentais contra o banco de dev — o I/O que o vitest não cobre: assinatura lida do
 * banco, dispensa com evento, índice parcial (uma ativa), corrida de dois cliques, dispensa velha que não
 * pode valer para ocorrência nova, e o job só avisando o que está aberto.
 *
 *   npm run smoke:pendencias-ciclo
 *
 * Cria um cliente/projeto descartáveis (tag SMKPEND_*) e apaga tudo no fim. As duas publicadas (I4) não
 * entram aqui: o índice do banco as impede — a regra é coberta pelos testes puros.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { dispensasObsoletas, MOTIVO_DISPENSA_ENCERRADA, MOTIVO_JA_DISPENSADA, MOTIVO_JA_RESOLVIDA } from "../src/modules/uploads/ciclo/pendencias";
import { desfazerDispensaNoBanco, dispensarNoBanco, encerrarDispensasObsoletasNoBanco } from "../src/modules/uploads/ciclo/pendencias-service";
import { pendenciasAbertasDoCiclo } from "../src/modules/uploads/ciclo/varredura";
import { pendenciasDoCiclo } from "../src/modules/uploads/ciclo/pendencias-queries";
import { verificarIntegridadeCiclo } from "../src/modules/uploads/ciclo/integridade-service";

async function main() {
  const tag = `SMKPEND_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const recusa = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: `${tag}_proj`,
        clienteId: cliente.id,
        disciplinas: { create: [{ disciplinaTextoLegado: "Estrutural", ordem: 0 }] },
      },
      include: { disciplinas: true },
    });
  });
  const disciplinaId = projeto.disciplinas[0].id;
  const escopo = { documento: { disciplina: { projetoId: projeto.id } } };
  const revisaoIds: string[] = [];

  let n = 0;
  async function documentoComRevisao(nome: string, estado: "arquivado" | "compartilhado", estadoEm: Date) {
    const documento = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}`, nomeArquivo: `${tag}-${nome}.pdf` },
    });
    const revisao = await prisma.documentoRevisao.create({ data: { documentoId: documento.id, numero: 1, createdById: usuario!.id, estado, estadoEm } });
    revisaoIds.push(revisao.id);
    return { documento, revisao };
  }
  async function arquivo(documentoId: string, revisaoId: string, excluido: boolean) {
    return prisma.upload.create({
      data: {
        disciplinaId,
        documentoId,
        revisaoId,
        pacote: "A",
        versao: ++n,
        nomeArquivo: `${tag}-doc-${n}.pdf`,
        caminho: `smoke/${tag}-${n}.pdf`,
        tamanho: 10,
        hashSha256: `${n}`.padStart(64, "0"),
        validado: true,
        autorId: usuario!.id,
        ...(excluido ? { excluidoEm: new Date(), excluidoPorId: usuario!.id } : {}),
      },
    });
  }
  const dispensasDe = (alvoId: string) => prisma.dispensaPendenciaCiclo.findMany({ where: { alvoId }, orderBy: { criadaEm: "asc" } });
  const abertasAgora = async () => (await pendenciasAbertasDoCiclo(prisma, new Date(), escopo)).abertas;
  const dispensadasAgora = async () => (await pendenciasAbertasDoCiclo(prisma, new Date(), escopo)).dispensadas;
  const ativaDe = (id: string, tipo: string) => prisma.dispensaPendenciaCiclo.count({ where: { alvoId: id, tipo, desfeitaEm: null } });

  try {
    const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const a = await documentoComRevisao("lixeira", "arquivado", new Date());
    await arquivo(a.documento.id, a.revisao.id, true);
    const b = await documentoComRevisao("parada", "compartilhado", dezDiasAtras);

    // ── a varredura vê as duas ──
    const ab0 = await abertasAgora();
    const lix = ab0.find((i) => i.violacao.tipo === "publicada_com_lixeira" && i.alvoId === a.revisao.id);
    const par = ab0.find((i) => i.violacao.tipo === "analise_parada" && i.alvoId === b.revisao.id);
    check("varredura: arquivada com arquivo na lixeira aparece (assinatura lix:1:arquivado)", lix?.chave === "lix:1:arquivado");
    check("varredura: revisão parada em análise há 10 dias aparece", par !== undefined);

    // ── dispensar ──
    await dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: lix!.chave, motivo: "Limpeza do smoke", userId: usuario.id });
    check(
      "dispensar: sai das abertas e entra nas dispensadas com o motivo",
      (await abertasAgora()).every((i) => i.alvoId !== a.revisao.id) &&
        (await dispensadasAgora()).some((i) => i.alvoId === a.revisao.id && i.dispensa?.motivo === "Limpeza do smoke"),
    );
    check(
      "dispensar: gravou evento no histórico do documento, com a revisão",
      (await prisma.documentoEvento.count({ where: { documentoId: a.documento.id, revisaoId: a.revisao.id, tipo: "pendencia_dispensada" } })) === 1,
    );
    check(
      "dispensar de novo a mesma assinatura é recusado com a frase certa",
      (await recusa(() =>
        dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: lix!.chave, motivo: "Limpeza do smoke", userId: usuario.id }),
      )) === MOTIVO_JA_DISPENSADA,
    );
    check(
      "assinatura que não é a de agora é recusada (tela velha)",
      (await recusa(() =>
        dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: "lix:9:arquivado", motivo: "Limpeza do smoke", userId: usuario.id }),
      )) === MOTIVO_JA_RESOLVIDA,
    );

    // ── estado mudou: reaparece; dispensa velha NÃO vale para a ocorrência nova ──
    const up2 = await arquivo(a.documento.id, a.revisao.id, true);
    const reapareceu = (await abertasAgora()).find((i) => i.alvoId === a.revisao.id);
    check("estado mudou (2 arquivos na lixeira): a pendência reaparece como aberta", reapareceu?.chave === "lix:2:arquivado");
    const { violacoes, dispensas } = await pendenciasAbertasDoCiclo(prisma, new Date(), escopo);
    // `dispensas` traz TODAS as ativas do banco (o `escopo` só estreita as violações): filtra para as deste
    // smoke, senão o encerramento abaixo fecharia dispensas reais de outros projetos do banco de dev.
    const obsoletas = dispensasObsoletas(violacoes, dispensas).filter((d) => revisaoIds.includes(d.alvoId));
    check("a dispensa velha é apontada como obsoleta", obsoletas.length === 1 && obsoletas[0].alvoId === a.revisao.id);
    check(
      "o job encerra a obsoleta pelo sistema (desfeitaPorId nulo)",
      (await encerrarDispensasObsoletasNoBanco(obsoletas.map((d) => d.id))) === 1 && (await dispensasDe(a.revisao.id))[0].desfeitaPorId === null,
    );
    await prisma.upload.update({ where: { id: up2.id }, data: { excluidoEm: null, excluidoPorId: null } });
    const volta = (await abertasAgora()).find((i) => i.alvoId === a.revisao.id);
    check("voltou a 1 arquivo: a assinatura é a de antes, e a dispensa velha NÃO a esconde", volta?.chave === "lix:1:arquivado");

    // ── dispensar de novo, desfazer ──
    await dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: volta!.chave, motivo: "Segunda dispensa", userId: usuario.id });
    check("uma dispensa ativa por alvo+tipo", (await ativaDe(a.revisao.id, "publicada_com_lixeira")) === 1);
    await desfazerDispensaNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", userId: usuario.id });
    check(
      "desfazer: a pendência volta e o evento foi gravado",
      (await abertasAgora()).some((i) => i.alvoId === a.revisao.id) &&
        (await prisma.documentoEvento.count({ where: { revisaoId: a.revisao.id, tipo: "pendencia_dispensa_desfeita" } })) === 1,
    );
    check(
      "desfazer de novo é recusado",
      (await recusa(() => desfazerDispensaNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", userId: usuario.id }))) === MOTIVO_DISPENSA_ENCERRADA,
    );

    // ── corrida: dois cliques na mesma pendência ──
    const chavePar = par!.chave;
    const r = await Promise.allSettled([
      dispensarNoBanco({ alvoId: b.revisao.id, tipo: "analise_parada", chave: chavePar, motivo: "Espera combinada", userId: usuario.id }),
      dispensarNoBanco({ alvoId: b.revisao.id, tipo: "analise_parada", chave: chavePar, motivo: "Espera combinada", userId: usuario.id }),
    ]);
    const passou = r.filter((x) => x.status === "fulfilled").length;
    const recusadas = r.filter((x) => x.status === "rejected" && (x.reason as Error).message === MOTIVO_JA_DISPENSADA).length;
    check(
      "corrida: uma dispensa passa e a outra recebe a frase de 'já dispensada'",
      passou === 1 && recusadas === 1 && (await ativaDe(b.revisao.id, "analise_parada")) === 1,
    );

    // ── a pendência deixa de existir (revisão voltou à análise agora): dispensar com a tela velha é recusado ──
    await prisma.documentoRevisao.update({ where: { id: b.revisao.id }, data: { estadoEm: new Date() } });
    check(
      "a pendência sumiu (análise recente): dispensar com a assinatura velha é recusado",
      (await recusa(() =>
        dispensarNoBanco({ alvoId: b.revisao.id, tipo: "analise_parada", chave: chavePar, motivo: "Tela velha aqui", userId: usuario.id }),
      )) === MOTIVO_JA_RESOLVIDA,
    );

    // ── a tela e o job leem a mesma coisa ──
    const tela = await pendenciasDoCiclo();
    check(
      "a leitura da tela traz a lixeira aberta deste projeto, com nome do projeto e documento",
      tela.abertas.some((x) => x.alvoId === a.revisao.id && x.projetoNome === `${tag}_proj` && x.documentoNome === `${tag}-lixeira.pdf`),
    );
    const job = await verificarIntegridadeCiclo();
    check("o job roda inteiro e devolve contagens", typeof job.relatadas === "number" && typeof job.encerradas === "number");

    // ── o que sobrou do aviso: abertas e dispensadas se separam ──
    await dispensarNoBanco({ alvoId: a.revisao.id, tipo: "publicada_com_lixeira", chave: "lix:1:arquivado", motivo: "Dispensada para o aviso", userId: usuario.id });
    const final = await pendenciasAbertasDoCiclo(prisma, new Date(), escopo);
    check(
      "a dispensada não entra nas abertas (que é o que o aviso lista)",
      final.abertas.every((i) => i.alvoId !== a.revisao.id) && final.dispensadas.some((i) => i.alvoId === a.revisao.id),
    );
  } finally {
    await prisma.dispensaPendenciaCiclo.deleteMany({ where: { alvoId: { in: revisaoIds } } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(ok ? "\nSmoke das pendências documentais: tudo certo." : "\nSmoke das pendências documentais: HOUVE FALHA.");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
