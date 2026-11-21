/**
 * Smoke da assinatura de contrato pelo portal do cliente (spec
 * docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md) contra o banco de dev.
 *
 * Seção "miolo": o `assinarVersaoNoTx` que o Jurídico (`registrarAceite`) e o portal usam. Confere a trava do documento
 * (duas assinaturas simultâneas = uma transição e recebíveis uma vez), a idempotência por pessoa e o autor dos
 * recebíveis (o `autorFinanceiroId`, não quem assina).
 *
 * Apaga tudo o que criou (inclusive o PDF gravado no storage).
 *
 * Uso: npm run smoke:portal-assinatura
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { rm } from "node:fs/promises";
import { removerArquivo, resolverCaminho, salvarArquivo } from "../src/lib/storage";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { assinarVersaoNoTx, hashDaVersao, type ResultadoAssinatura } from "../src/modules/juridico/assinatura/assinar-service";

const PDF_MINIMO = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function main() {
  const tag = `SMKASSINATURA_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];
  const documentos: string[] = [];
  const arquivos: string[] = [];

  const novoUsuario = async (sufixo: string) => {
    const u = await prisma.user.create({
      data: { name: `Assinante ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno" },
    });
    usuarios.push(u.id);
    return u;
  };

  try {
    const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
    clientes.push(cliente.id);
    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id },
      });
    });
    projetos.push(projeto.id);

    const userA = await novoUsuario("a");
    const userB = await novoUsuario("b");
    const financeiro = await novoUsuario("fin");

    // ── Seção "miolo" ────────────────────────────────────────────────────────────────────────
    const primeiroVencimento = new Date();
    primeiroVencimento.setUTCHours(0, 0, 0, 0);
    primeiroVencimento.setUTCDate(primeiroVencimento.getUTCDate() + 30);
    const doc = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} contrato`,
        tipo: "contrato",
        statusContrato: "rascunho",
        clienteId: cliente.id,
        projetoId: projeto.id,
        valor: 1000,
        parcelas: 2,
        primeiroVencimento,
        formaCobranca: "por_data",
      },
    });
    documentos.push(doc.id);
    const caminho = `juridico/smoke_${tag}/v1.pdf`;
    await salvarArquivo(caminho, PDF_MINIMO);
    arquivos.push(caminho);
    const versao = await prisma.docJuridicoVersao.create({
      data: { documentoId: doc.id, numero: 1, arquivoPath: caminho, arquivoNome: "v1.pdf", autorId: userA.id },
    });

    const hash = await hashDaVersao(versao.id);
    const assinar = (ator: { id: string; name: string }) =>
      prisma.$transaction((tx) =>
        assinarVersaoNoTx(tx, {
          versaoId: versao.id,
          ator: { id: ator.id, nome: ator.name },
          autorFinanceiroId: financeiro.id,
          hashArquivo: hash,
          ip: "127.0.0.1",
          userAgent: "smoke",
        }),
      );

    const [rA, rB]: ResultadoAssinatura[] = await Promise.all([assinar(userA), assinar(userB)]);
    const aceites = await prisma.aceiteDocumento.count({ where: { versaoId: versao.id } });
    const docDepois = await prisma.documentoJuridico.findUniqueOrThrow({ where: { id: doc.id } });
    const parcelas = await prisma.lancamento.count({ where: { contratoId: doc.id, status: { not: "previsao" } } });
    const eventos = await prisma.eventoAssinatura.findMany({ where: { versaoId: versao.id }, orderBy: { sequencia: "asc" } });
    check(
      "[miolo] duas assinaturas simultâneas (usuários diferentes): dois aceites, uma transição, assinado, parcelas uma vez",
      aceites === 2 &&
        [rA, rB].filter((r) => r.transicao).length === 1 &&
        !rA.jaAssinado &&
        !rB.jaAssinado &&
        docDepois.statusContrato === "assinado" &&
        docDepois.assinadoEm != null &&
        parcelas === 2,
    );
    check(
      "[miolo] trilha encadeada: dois eventos 'assinado' em sequência 1 e 2",
      eventos.length === 2 && eventos.every((e) => e.tipo === "assinado") && eventos[0].sequencia === 1 && eventos[1].sequencia === 2,
    );

    const rDeNovo = await assinar(userA);
    const aceitesDeNovo = await prisma.aceiteDocumento.count({ where: { versaoId: versao.id } });
    check(
      "[miolo] mesma pessoa de novo: jaAssinado, sem transição, aceites continuam 2, mesmo aceite",
      rDeNovo.jaAssinado && !rDeNovo.transicao && aceitesDeNovo === 2 && rDeNovo.aceiteId === rA.aceiteId,
    );

    const lancs = await prisma.lancamento.findMany({ where: { contratoId: doc.id }, select: { autorId: true } });
    check(
      "[miolo] recebíveis com autor financeiro (não quem assinou)",
      lancs.length === 2 && lancs.every((l) => l.autorId === financeiro.id),
    );
    check(
      "[miolo] resultado traz o documento (forma, projeto, sem vínculo)",
      rA.documento.id === doc.id && rA.documento.projetoId === projeto.id && rA.documento.vinculoId === null && rA.documento.formaCobranca === "por_data",
    );
  } finally {
    // Cada remoção em separado: uma falha não deixa o resto do lixo no banco de dev.
    const remover = async (rotulo: string, id: string, apagar: () => Promise<unknown>) => {
      try {
        await apagar();
      } catch (e) {
        console.error(`[limpeza] não removeu ${rotulo} ${id}:`, e);
      }
    };
    for (const id of documentos) {
      await remover("lançamentos do contrato", id, () =>
        prisma.lancamento.deleteMany({ where: { contratoId: id, excluidoEm: { not: undefined } } }),
      );
      // A versão leva aceites e eventos (cascade); o documento leva a versão.
      await remover("documento", id, () => prisma.documentoJuridico.delete({ where: { id } }));
    }
    for (const caminho of arquivos) await remover("arquivo", caminho, () => removerArquivo(caminho));
    await remover("pasta do smoke", tag, () => rm(resolverCaminho(`juridico/smoke_${tag}`), { recursive: true, force: true }));
    for (const id of projetos) await remover("projeto", id, () => prisma.projeto.delete({ where: { id } }));
    for (const id of usuarios) await remover("usuário", id, () => prisma.user.delete({ where: { id } }));
    for (const id of clientes) await remover("cliente", id, () => prisma.cliente.delete({ where: { id } }));
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
