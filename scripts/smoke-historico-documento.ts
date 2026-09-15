/**
 * Smoke do histórico por documento (`DocumentoEvento`) contra o banco de dev. Cobre o que o
 * vitest não alcança: o upsert atômico do agrupamento de acessos (inclusive concorrente), o
 * corte de visibilidade dos acessos, o documento absorvido por merge entrando no histórico do
 * vivo e o evento que sobrevive à exclusão definitiva do arquivo.
 *
 * Cria cliente + projeto + documento throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:historico-documento
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import {
  registrarAcessoUploads,
  registrarEventoDocumento,
  registrarEventoUploads,
} from "../src/modules/uploads/historico/service";
import { historicoDocumento } from "../src/modules/uploads/historico/queries";

async function main() {
  const tag = `SMKHIST_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const usuario = await prisma.user.findFirst({ where: { ativo: true }, select: { id: true, name: true } });
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

  try {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}.pdf`, nomeArquivo: `${tag}.pdf` },
    });
    const apelido = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-antigo.pdf`, nomeArquivo: `${tag}-antigo.pdf`, substituidoPorId: doc.id },
    });
    const upload = await prisma.upload.create({
      data: { disciplinaId, documentoId: doc.id, pacote: "A", nomeArquivo: `${tag}.pdf`, caminho: `smoke/${tag}.pdf`, tamanho: 10, hashSha256: "0".repeat(64), autorId: usuario.id },
    });

    // ── acessos agrupados ──
    await registrarAcessoUploads({ uploadIds: [upload.id], tipo: "download", origem: "interno", userId: usuario.id });
    await registrarAcessoUploads({ uploadIds: [upload.id], tipo: "download", origem: "interno", userId: usuario.id });
    await Promise.all(
      Array.from({ length: 5 }, () =>
        registrarAcessoUploads({ uploadIds: [upload.id], tipo: "download", origem: "interno", userId: usuario.id }),
      ),
    );
    const downloads = await prisma.documentoEvento.findMany({ where: { documentoId: doc.id, tipo: "download" } });
    check("7 downloads na mesma janela viram 1 linha", downloads.length === 1);
    check("a linha soma as 7 ocorrências (inclusive as 5 concorrentes)", downloads[0]?.quantidade === 7);

    await registrarAcessoUploads({ uploadIds: [upload.id], tipo: "visualizacao", origem: "interno", userId: usuario.id });
    await registrarAcessoUploads({ uploadIds: [upload.id], tipo: "visualizacao", origem: "link_publico", userId: null, linkId: "link-smoke" });
    const acessos = await prisma.documentoEvento.count({ where: { documentoId: doc.id, categoria: "acesso" } });
    check("visualização interna e por link público são linhas separadas do download", acessos === 3);

    // ── alterações ──
    await registrarEventoUploads({ uploadIds: [upload.id], tipo: "validacao", userId: usuario.id });
    await registrarEventoDocumento({
      documentoId: doc.id,
      tipo: "metadados",
      userId: usuario.id,
      detalhe: { campos: { fase: { de: null, para: "BS" } } },
    });
    await registrarEventoDocumento({ documentoId: apelido.id, tipo: "renomeio", userId: usuario.id, detalhe: { de: "x", para: "y" } });
    // Merge em dois níveis: o documento absorvido pelo apelido também precisa aparecer.
    const neto = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-mais-antigo.pdf`, nomeArquivo: `${tag}-mais-antigo.pdf`, substituidoPorId: apelido.id },
    });
    await registrarEventoDocumento({ documentoId: neto.id, tipo: "status", userId: usuario.id, detalhe: { de: null, para: "Aprovado" } });

    // ── visibilidade ──
    const semAcessos = await historicoDocumento(doc.id, { incluirAcessos: false });
    check("sem ver_acessos, nenhum acesso aparece", semAcessos.eventos.every((e) => e.categoria === "alteracao"));
    check("sem ver_acessos, as 4 alterações aparecem (incluindo as dos documentos absorvidos em 2 níveis)", semAcessos.eventos.length === 4);
    const comAcessos = await historicoDocumento(doc.id, { incluirAcessos: true });
    check("com ver_acessos, alterações + acessos", comAcessos.eventos.length === 7);
    const validacao = comAcessos.eventos.find((e) => e.tipo === "validacao");
    check("evento de arquivo guarda nome e revisão", validacao?.arquivo === `${tag}.pdf` && validacao?.versao === 1);
    check("autor resolvido pelo nome", validacao?.autor === usuario.name);
    const metadados = comAcessos.eventos.find((e) => e.tipo === "metadados");
    check("metadados descrevem a mudança de fase", metadados?.complemento === 'fase: vazio → "BS"');
    const externo = comAcessos.eventos.find((e) => e.origem === "link_publico");
    check("acesso por link público fica sem autor", externo?.autor === null);

    // ── exclusão definitiva: o rastro sobrevive ao Upload ──
    await prisma.upload.delete({ where: { id: upload.id } });
    await registrarEventoDocumento({
      documentoId: doc.id,
      uploadId: upload.id,
      tipo: "exclusao_definitiva",
      userId: usuario.id,
      detalhe: { arquivo: `${tag}.pdf`, versao: 1 },
    });
    const depois = await historicoDocumento(doc.id, { incluirAcessos: true });
    check("histórico continua inteiro depois do arquivo apagado", depois.eventos.length === 8);

    // ── falha de gravação não propaga ──
    let lancou = false;
    try {
      await registrarEventoDocumento({ documentoId: "inexistente", tipo: "status", userId: usuario.id });
    } catch {
      lancou = true;
    }
    check("FK inválida é engolida (a ação de negócio não cai por causa do histórico)", !lancou);
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
