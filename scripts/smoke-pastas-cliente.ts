/**
 * Smoke das pastas do cliente — "Compartilhado" e "Liberado para obra" (reunião de 29/09/2026) — contra o
 * banco de dev. O vitest cobre as regras puras (`revisao-marcada.ts`, `pastas-da-lista.ts`,
 * `link-publico-regras.ts`); aqui vai o SQL: a lista e a árvore da aba Arquivos dentro da pasta (revisão
 * MARCADA, não a vigente), a contagem da raiz, o link público com as duas pastas (página, download direto e
 * .zip com a MESMA regra), o documento Obsoleto fora do link comum, e o documento que some da pasta quando a
 * revisão marcada perde a validação.
 *
 * Cria cliente + projeto + documentos throwaway e apaga tudo no final. Exige as migrações
 * 20260929150000 e 20260929160000 aplicadas.
 *
 * Uso: npm run smoke:pastas-cliente
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { randomBytes } from "node:crypto";
import {
  conteudoPublicoPorToken,
  uploadLiberadoNoLink,
  uploadsDoLinkParaZip,
} from "../src/modules/projetos/arquivos/link-publico";
import {
  arvoreNavegacaoDocumentos,
  contagemPorSituacao,
  listarDocumentosAgrupados,
  type FiltrosDoc,
} from "../src/modules/uploads/documentos-agrupados";

async function main() {
  const tag = `SMKPASTA_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const usuario = await prisma.user.findFirst({ where: { ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", ativo: true, projetoId: null }, select: { id: true } });
  if (!fase) throw new Error("Banco de dev sem fase no catálogo.");

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

  const documento = async (nome: string) =>
    prisma.documentoDisciplina.create({ data: { disciplinaId, chave: `A/${tag}-${nome}.pdf`, nomeArquivo: `${tag}-${nome}.pdf`, faseId: fase.id } });
  const revisao = (documentoId: string, numero: number) => prisma.documentoRevisao.create({ data: { documentoId, numero, createdById: usuario.id } });
  const arquivo = (documentoId: string, revisaoId: string, nome: string, validado: boolean) =>
    prisma.upload.create({
      data: {
        disciplinaId,
        documentoId,
        revisaoId,
        pacote: "A",
        nomeArquivo: nome,
        caminho: `smoke/${nome}`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: usuario.id,
        validado,
      },
    });

  const listar = (filtros: FiltrosDoc, formatoDosArquivos?: string) =>
    listarDocumentosAgrupados({
      projetoIds: [projeto.id],
      userId: usuario.id,
      veTodas: true,
      ehGlobal: true,
      podeEnviarCap: true,
      podeEditarMetadados: true,
      podeAlterarStatus: true,
      filtros: { disciplinaId, ...filtros },
      skip: 0,
      take: 50,
      sort: null,
      dir: "desc",
      formatoDosArquivos,
    });

  try {
    // D1: R01 validada (PDF+DWG) e R02 em análise (PDF sem validação) — compartilhada na R01.
    const d1 = await documento("d1");
    const r1 = await revisao(d1.id, 1);
    const pdf1 = await arquivo(d1.id, r1.id, `${tag}-d1-R00.pdf`, true);
    const dwg1 = await arquivo(d1.id, r1.id, `${tag}-d1-R00.dwg`, true);
    const r2 = await revisao(d1.id, 2);
    await arquivo(d1.id, r2.id, `${tag}-d1-R01.pdf`, false);
    await prisma.documentoDisciplina.update({ where: { id: d1.id }, data: { revisaoCompartilhadaId: r1.id } });
    // D2: liberado para obra. D3: sem marca.
    const d2 = await documento("d2");
    const r2a = await revisao(d2.id, 1);
    await arquivo(d2.id, r2a.id, `${tag}-d2-R00.pdf`, true);
    await prisma.documentoDisciplina.update({ where: { id: d2.id }, data: { revisaoLiberadaObraId: r2a.id } });
    const d3 = await documento("d3");
    const r3 = await revisao(d3.id, 1);
    const pdf3 = await arquivo(d3.id, r3.id, `${tag}-d3-R00.pdf`, true);
    const pdfNovo = await prisma.upload.findFirstOrThrow({ where: { revisaoId: r2.id }, select: { id: true } });
    const pdfD2 = await prisma.upload.findFirstOrThrow({ where: { revisaoId: r2a.id }, select: { id: true } });

    const contagem = await contagemPorSituacao({ projetoIds: [projeto.id], userId: usuario.id, veTodas: true });
    check("contagem da raiz: 1 compartilhado, 1 liberado para obra", contagem.compartilhado === 1 && contagem.liberado_obra === 1);

    const compartilhado = await listar({ situacao: "compartilhado" });
    const linha = compartilhado.linhas[0];
    check("dentro de Compartilhado só o documento marcado", compartilhado.total === 1 && linha?.id === d1.id);
    check("a linha é a da revisão MARCADA (R01 do banco), não a vigente", linha?.revisaoAtual === 1);
    check(
      "os arquivos são os validados da revisão marcada (PDF+DWG), nunca o PDF novo em análise",
      linha?.arquivos.map((a) => a.id).sort().join() === [pdf1.id, dwg1.id].sort().join(),
    );

    const soDwg = await listar({ situacao: "compartilhado", ext: "dwg" }, "dwg");
    check("pasta de formato dentro de Compartilhado: só o DWG da revisão marcada", soDwg.total === 1 && soDwg.linhas[0]?.arquivos.map((a) => a.id).join() === dwg1.id);

    const arvore = await arvoreNavegacaoDocumentos({ projetoIds: [projeto.id], userId: usuario.id, veTodas: true, situacao: "compartilhado" });
    const noFase = arvore.find((a) => a.disciplinaId === disciplinaId)?.fases.find((f) => f.chave === fase.id);
    check("árvore de Compartilhado conta 1 documento na fase", noFase?.total === 1);
    check("com as pastas PDF e DWG", (noFase?.extensoes.map((e) => e.chave).sort().join() ?? "") === "dwg,pdf");

    const normal = await listar({});
    const d1Normal = normal.linhas.find((l) => l.id === d1.id);
    check("fora da pasta a linha segue a vigente (R02) e sabe que o cliente está na R01", d1Normal?.revisaoAtual === 2 && d1Normal?.revisaoCompartilhada === 1);

    // ── link público com as duas pastas ──
    const novoLink = (porSituacao: boolean) =>
      prisma.linkPublicoArquivos.create({
        data: { projetoId: projeto.id, token: randomBytes(18).toString("hex"), escopo: "projeto_todo", porSituacao },
      });
    const linkPastas = await novoLink(true);
    const linkComum = await novoLink(false);

    const pagina = await conteudoPublicoPorToken(linkPastas.token);
    const [pComp, pObra] = pagina?.situacoes ?? [];
    const idsComp = pComp?.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos.map((a) => a.id)))) ?? [];
    const idsObra = pObra?.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos.map((a) => a.id)))) ?? [];
    check("link por situação: as duas pastas, nessa ordem, sem disciplinas soltas", pComp?.id === "compartilhado" && pObra?.id === "liberado_obra" && pagina?.disciplinas.length === 0);
    check("Compartilhado mostra o PDF+DWG da revisão marcada, não a R02 nem o documento sem marca", idsComp.sort().join() === [pdf1.id, dwg1.id].sort().join());
    check("Liberado para obra mostra só o documento liberado", idsObra.join() === pdfD2.id);

    check("download direto: arquivo da revisão marcada abre", (await uploadLiberadoNoLink(linkPastas.token, pdf1.id)) !== null);
    check("download direto: R02 em análise NÃO abre", (await uploadLiberadoNoLink(linkPastas.token, pdfNovo.id)) === null);
    check("download direto: documento sem marca NÃO abre", (await uploadLiberadoNoLink(linkPastas.token, pdf3.id)) === null);

    const zip = await uploadsDoLinkParaZip(linkPastas.token);
    const nomes = zip?.entradas.map((e) => e.nome) ?? [];
    check("o .zip espelha as pastas (Compartilhado/… e Liberado para obra/…)", nomes.length === 3 && nomes.every((n) => n.startsWith("Compartilhado/") || n.startsWith("Liberado para obra/")));
    const soObra = await uploadsDoLinkParaZip(linkPastas.token, { situacao: "liberado_obra" });
    check(".zip de uma pasta só leva ela", soObra?.entradas.length === 1 && soObra.entradas[0].uploadId === pdfD2.id);

    const comum = await conteudoPublicoPorToken(linkComum.token);
    const idsComum = comum?.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos.map((a) => a.id)))) ?? [];
    check("link comum (antigo) continua igual: última revisão validada de tudo", comum?.situacoes.length === 0 && idsComum.includes(pdf3.id));

    // Obsoleto sai do link comum — inteiro, sem promover revisão anterior — e da URL direta.
    const obsoleto = await prisma.documentoStatus.findUniqueOrThrow({ where: { chave: "obsoleto" }, select: { id: true } });
    await prisma.documentoDisciplina.update({ where: { id: d3.id }, data: { statusId: obsoleto.id } });
    const comumDepois = await conteudoPublicoPorToken(linkComum.token);
    const idsDepois = comumDepois?.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos.map((a) => a.id)))) ?? [];
    check("documento Obsoleto sai do link comum", !idsDepois.includes(pdf3.id));
    check("e a URL direta dele para de abrir", (await uploadLiberadoNoLink(linkComum.token, pdf3.id)) === null);

    // Validação desfeita na revisão marcada: some da pasta (e do link), como o link sempre fez.
    await prisma.upload.updateMany({ where: { revisaoId: r1.id }, data: { validado: false } });
    const depois = await listar({ situacao: "compartilhado" });
    const contagemDepois = await contagemPorSituacao({ projetoIds: [projeto.id], userId: usuario.id, veTodas: true });
    check("revisão marcada sem arquivo validado sai da pasta", depois.total === 0 && contagemDepois.compartilhado === 0);
    check("…e do link", (await uploadLiberadoNoLink(linkPastas.token, pdf1.id)) === null);
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
