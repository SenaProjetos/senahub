/**
 * Smoke do status documental automático (reunião de 29/09/2026) contra o banco de dev. O vitest cobre as
 * regras puras (`status-documento.ts`); aqui vai o I/O: achar o status pela chave, "revisão vigente" pelos
 * arquivos fora da lixeira, o 1º arquivo da revisão, o arquivo ainda validado que segura o "Aprovado", e o
 * evento no histórico marcado como automático.
 *
 * Cria cliente + projeto + documento throwaway e apaga tudo no final. Exige a migração
 * 20260929150000_documento_status_compartilhado aplicada (status com `chave`).
 *
 * Uso: npm run smoke:status-documento
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { statusAposDesvalidacao, statusAposEnvio, statusAposValidacao } from "../src/modules/uploads/status-automatico";
import { historicoDocumento } from "../src/modules/uploads/historico/queries";

// Desde o ciclo documental (2026-10-08) a automação do catálogo antigo só age FORA do ciclo (pacote A
// sem IFC é do ciclo — D10). O documento deste smoke fica no pacote B para continuar exercitando a regra.
async function main() {
  const tag = `SMKSTATUS_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const usuario = await prisma.user.findFirst({ where: { ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");
  const porChave = async (chave: string) => {
    const s = await prisma.documentoStatus.findUnique({ where: { chave }, select: { id: true } });
    if (!s) throw new Error(`Status "${chave}" não existe — rode a migração 20260929150000.`);
    return s.id;
  };

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

  try {
    const doc = await prisma.documentoDisciplina.create({ data: { disciplinaId, chave: `B/${tag}.pdf`, nomeArquivo: `${tag}.pdf` } });
    const chaveAtual = async () =>
      (await prisma.documentoDisciplina.findUnique({ where: { id: doc.id }, select: { status: { select: { chave: true } } } }))?.status?.chave ?? null;
    const setStatus = async (chave: string | null) =>
      prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { statusId: chave ? await porChave(chave) : null } });
    const revisao = (numero: number) => prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero, createdById: usuario.id } });
    const arquivo = (revisaoId: string, ext: string, versao: number) =>
      prisma.upload.create({
        data: {
          disciplinaId,
          documentoId: doc.id,
          revisaoId,
          versao,
          pacote: "B",
          nomeArquivo: `${tag}.${ext}`,
          caminho: `smoke/${tag}-${versao}.${ext}`,
          tamanho: 10,
          hashSha256: "0".repeat(64),
          autorId: usuario.id,
        },
      });
    const validar = (ids: string[], validado: boolean) => prisma.upload.updateMany({ where: { id: { in: ids } }, data: { validado } });

    // ── R01: o PDF abre a revisão, o DWG chega depois ──
    const r1 = await revisao(1);
    const pdf1 = await arquivo(r1.id, "pdf", 1);
    await statusAposEnvio({ uploadId: pdf1.id, userId: usuario.id });
    check("1º arquivo da revisão nova → Enviado", (await chaveAtual()) === "enviado");

    await setStatus("em_analise");
    const dwg1 = await arquivo(r1.id, "dwg", 1);
    await statusAposEnvio({ uploadId: dwg1.id, userId: usuario.id });
    check("o DWG que chega depois na mesma revisão não mexe (fica Em análise)", (await chaveAtual()) === "em_analise");

    // ── validação ──
    await validar([pdf1.id], true);
    await statusAposValidacao({ uploadIds: [pdf1.id], userId: usuario.id });
    check("validar a prancha da revisão vigente → Aprovado", (await chaveAtual()) === "aprovado");

    await validar([pdf1.id], false);
    await statusAposDesvalidacao({ uploadIds: [pdf1.id], userId: usuario.id, motivo: "reverter" });
    check("reverter a validação → volta a Enviado", (await chaveAtual()) === "enviado");

    await validar([pdf1.id, dwg1.id], true);
    await statusAposValidacao({ uploadIds: [pdf1.id, dwg1.id], userId: usuario.id });
    await validar([dwg1.id], false);
    await statusAposDesvalidacao({ uploadIds: [dwg1.id], userId: usuario.id, motivo: "reverter" });
    check("reverter só o DWG: o PDF validado segura o Aprovado", (await chaveAtual()) === "aprovado");

    await validar([pdf1.id], false);
    await statusAposDesvalidacao({ uploadIds: [pdf1.id], userId: usuario.id, motivo: "correcao" });
    check("correção pedida sem nada validado → Correção solicitada", (await chaveAtual()) === "correcao_solicitada");

    await setStatus("compartilhado");
    await validar([pdf1.id], true);
    await statusAposValidacao({ uploadIds: [pdf1.id], userId: usuario.id });
    check("validar não desfaz o Compartilhado posto à mão", (await chaveAtual()) === "compartilhado");

    // ── R02 ──
    const r2 = await revisao(2);
    const pdf2 = await arquivo(r2.id, "pdf", 2);
    await statusAposEnvio({ uploadId: pdf2.id, userId: usuario.id });
    check("revisão nova depois de Compartilhado → Enviado", (await chaveAtual()) === "enviado");

    await statusAposValidacao({ uploadIds: [pdf1.id], userId: usuario.id });
    check("validar arquivo da revisão ANTIGA não mexe", (await chaveAtual()) === "enviado");

    // A R02 vai para a lixeira: a vigente volta a ser a R01 (mesma regra da tela).
    await prisma.upload.update({ where: { id: pdf2.id }, data: { excluidoEm: new Date() } });
    await statusAposValidacao({ uploadIds: [pdf1.id], userId: usuario.id });
    check("com a R02 na lixeira, a R01 é a vigente de novo", (await chaveAtual()) === "aprovado");

    // ── status final ──
    await setStatus("obsoleto");
    const r3 = await revisao(3);
    const pdf3 = await arquivo(r3.id, "pdf", 3);
    await statusAposEnvio({ uploadId: pdf3.id, userId: usuario.id });
    check("status final nunca é tocado", (await chaveAtual()) === "obsoleto");

    // ── histórico ──
    const h = await historicoDocumento(doc.id, { incluirAcessos: false });
    const automaticos = h.eventos.filter((e) => e.tipo === "status");
    check("cada troca automática virou evento de status", automaticos.length === 7);
    check("o evento diz que foi automático e por quê", automaticos.some((e) => e.complemento?.includes("automático, prancha validada")));
  } finally {
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
