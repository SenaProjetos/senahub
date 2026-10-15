/**
 * Smoke do link projeto × ficha do funil (spec 2026-10-15-vinculo-projeto-ficha-design.md) contra o banco de dev.
 * O vitest cobre as regras puras (`vinculo/regras.ts`); aqui vai o SQL e o disco: recusas, preenchimento só de campo
 * vazio, cópia do arquivo (excluir o anexo do funil não quebra o projeto), corrida de dois cliques sem arquivo órfão,
 * deduplicação por hash, arquivo ausente, ficha sem lead, desfazer link e a trava do projeto criado pelo aceite.
 *
 * Cria cliente + lead + fichas + projetos + arquivos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:vinculo-projeto-ficha
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { existeArquivo, listarArquivos, removerArquivo, salvarArquivo } from "../src/lib/storage";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import {
  desvincularProjetoDaFicha,
  vincularProjetoNaFicha,
} from "../src/modules/comercial/vinculo/service";
import { previaVinculo, projetosLinkaveis } from "../src/modules/comercial/vinculo/queries";
import type { SessionUser } from "../src/lib/session";

async function main() {
  const tag = `SMKVINC_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const rejeita = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true, tipo: "interno" }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem superusuário interno ativo.");
  const etapa = await prisma.funilEtapa.findFirst({ select: { id: true } });
  if (!etapa) throw new Error("Banco de dev sem FunilEtapa.");
  const user = { id: usuario.id, tipo: "interno", superUsuario: true, ativo: true } as unknown as SessionUser;

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const cliente2 = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli2` } });
  const caminhos: string[] = [];
  const projetosExtras: string[] = [];

  const novoProjeto = (nome: string, extra: { valorContrato?: number } = {}) =>
    prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${nome}`, clienteId: cliente.id, ...extra },
      });
    });

  const lead = await prisma.lead.create({ data: { nome: `${tag}_lead`, etapaId: etapa.id, clienteId: cliente.id } });
  const anexo = async (nome: string, conteudo: string) => {
    const salvo = await salvarArquivo(`comercial/leads/${tag}-${randomBytes(4).toString("hex")}.txt`, Buffer.from(conteudo));
    caminhos.push(salvo.caminho);
    return prisma.anexoLead.create({
      data: { leadId: lead.id, nome, caminho: salvo.caminho, nomeArquivo: `${nome}.txt`, mime: "text/plain", tamanho: salvo.tamanho, hashSha256: salvo.hashSha256 },
    });
  };
  const anexoA = await anexo("Solicitacao", `${tag} A`);
  const anexoB = await anexo("Referencias", `${tag} B`);

  const ficha = await prisma.negociacao.create({
    data: { titulo: `${tag}_ficha`, clienteId: cliente.id, leadId: lead.id, estagio: "CONTRATADO", valorNegociado: 150000, areaM2: 320.5, responsavelId: usuario.id },
  });
  const fichaAberta = await prisma.negociacao.create({
    data: { titulo: `${tag}_aberta`, clienteId: cliente.id, estagio: "ORCAMENTO" },
  });
  const fichaOutroCliente = await prisma.negociacao.create({
    data: { titulo: `${tag}_outro`, clienteId: cliente2.id, estagio: "CONTRATADO" },
  });
  const fichaSemLead = await prisma.negociacao.create({
    data: { titulo: `${tag}_sem_lead`, clienteId: cliente.id, estagio: "CONTRATADO" },
  });

  const p1 = await novoProjeto("p1");
  const p2 = await novoProjeto("p2", { valorContrato: 99 });
  const p3 = await novoProjeto("p3");
  const p4 = await novoProjeto("p4");

  try {
    // 1-2. Recusas
    check("1. ficha que não está em Contratado é recusada", ((await previaVinculo(user, p1.id, fichaAberta.id)).motivo ?? "").includes("Contratado"));
    check("2. cliente diferente é recusado", ((await previaVinculo(user, p1.id, fichaOutroCliente.id)).motivo ?? "").includes("cliente"));

    // 3. Prévia
    const previa = await previaVinculo(user, p1.id, ficha.id);
    check("3a. prévia sem recusa", previa.motivo === null);
    check("3b. prévia preenche valor e área", previa.plano.preenche.valorContrato === 150000 && previa.plano.preenche.areaM2 === 320.5);
    check("3c. prévia lista os 2 anexos, ambos marcados", previa.arquivos.length === 2 && previa.arquivos.every((a) => a.importarPadrao));
    check("3d. prévia traz o coordenador (responsável da ficha)", previa.coordenador?.id === usuario.id);

    // 4. Link de verdade: A aparece em Recebidos, B não
    const r1 = await vincularProjetoNaFicha(user, {
      projetoId: p1.id,
      negociacaoId: ficha.id,
      arquivos: [
        { chave: `lead:${anexoA.id}`, exibirEmRecebidos: true },
        { chave: `lead:${anexoB.id}`, exibirEmRecebidos: false },
      ],
      incluirResumo: false,
    });
    const p1depois = await prisma.projeto.findUnique({ where: { id: p1.id }, select: { negociacaoId: true, valorContrato: true, areaM2: true, descricao: true } });
    const docs = await prisma.documento.findMany({ where: { projetoId: p1.id }, include: { versoes: true }, orderBy: { createdAt: "asc" } });
    check("4a. projeto ficou linkado", p1depois?.negociacaoId === ficha.id);
    check("4b. valor e área preenchidos", Number(p1depois?.valorContrato) === 150000 && Number(p1depois?.areaM2) === 320.5);
    check("4c. 2 documentos na Geral (origem interno), categoria Comercial", docs.length === 2 && docs.every((d) => d.origem === "interno" && d.categoria === "Comercial"));
    check("4d. exibirEmRecebidos só no marcado", docs.filter((d) => d.exibirEmRecebidos).length === 1 && docs.find((d) => d.exibirEmRecebidos)?.nome === "Solicitacao");
    check("4e. coordenador criado como membro", (await prisma.projetoMembro.count({ where: { projetoId: p1.id, userId: usuario.id, papel: "coordenador" } })) === 1);
    check("4f. evento na timeline da ficha", (await prisma.atividade.count({ where: { negociacaoId: ficha.id, descricao: { contains: "linkado" } } })) === 1);
    check("4g. resultado informa 2 arquivos", r1.arquivos === 2 && r1.coordenadorCriado);

    // 5. Cópia ≠ original: apagar o anexo do funil não quebra o projeto
    const copiaA = docs.find((d) => d.nome === "Solicitacao")!.versoes[0].caminho;
    check("5a. caminho copiado é outro", copiaA !== anexoA.caminho && copiaA.startsWith(`documentos/${cliente.id}/`));
    await removerArquivo(anexoA.caminho);
    await prisma.anexoLead.delete({ where: { id: anexoA.id } });
    check("5b. copia segue no disco depois de apagar o anexo do funil", await existeArquivo(copiaA));

    // 6. Segundo link do mesmo projeto
    const m6 = await rejeita(vincularProjetoNaFicha(user, { projetoId: p1.id, negociacaoId: ficha.id, arquivos: [], incluirResumo: false }));
    check("6. segundo link do mesmo projeto é recusado", (m6 ?? "").includes("já está linkado"));

    // 7. Não sobrescreve
    await vincularProjetoNaFicha(user, { projetoId: p2.id, negociacaoId: ficha.id, arquivos: [], incluirResumo: false });
    const p2depois = await prisma.projeto.findUnique({ where: { id: p2.id }, select: { valorContrato: true, areaM2: true } });
    check("7. valor existente mantido; área vazia preenchida", Number(p2depois?.valorContrato) === 99 && Number(p2depois?.areaM2) === 320.5);

    // 8. Corrida: dois cliques no mesmo projeto, um arquivo
    const antes = (await listarArquivos(`documentos/${cliente.id}`)).length;
    const corrida = await Promise.allSettled([
      vincularProjetoNaFicha(user, { projetoId: p3.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoB.id}`, exibirEmRecebidos: false }], incluirResumo: false }),
      vincularProjetoNaFicha(user, { projetoId: p3.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoB.id}`, exibirEmRecebidos: false }], incluirResumo: false }),
    ]);
    const depois = (await listarArquivos(`documentos/${cliente.id}`)).length;
    check("8a. só um dos dois cliques grava", corrida.filter((c) => c.status === "fulfilled").length === 1);
    check("8b. um único documento no projeto", (await prisma.documento.count({ where: { projetoId: p3.id } })) === 1);
    check("8c. nenhum arquivo órfão no disco (só 1 cópia nova)", depois - antes === 1);

    // 9. Desfazer link: mantém o importado
    await desvincularProjetoDaFicha(user, p1.id);
    check("9a. link desfeito", (await prisma.projeto.findUnique({ where: { id: p1.id }, select: { negociacaoId: true } }))?.negociacaoId === null);
    check("9b. documentos importados continuam", (await prisma.documento.count({ where: { projetoId: p1.id } })) === 2);
    check("9c. evento de desfazer na timeline", (await prisma.atividade.count({ where: { negociacaoId: ficha.id, descricao: { contains: "desfeito" } } })) === 1);
    check("9d. desfazer sem link é recusado", ((await rejeita(desvincularProjetoDaFicha(user, p1.id))) ?? "").includes("não está linkado"));

    // 10. Deduplicação por hash (B já está em P1)
    const reprevia = await previaVinculo(user, p1.id, ficha.id);
    const itemB = reprevia.arquivos.find((a) => a.chave === `lead:${anexoB.id}`);
    check("10. arquivo já no projeto vem desmarcado", itemB?.importarPadrao === false && (itemB?.motivoNaoImportar ?? "").includes("projeto"));

    // 11. Arquivo sumiu do disco
    const anexoC = await anexo("Sumiu", `${tag} C`);
    await removerArquivo(anexoC.caminho);
    const previaC = await previaVinculo(user, p1.id, ficha.id);
    const itemC = previaC.arquivos.find((a) => a.chave === `lead:${anexoC.id}`);
    check("11a. arquivo ausente vem desabilitado", itemC?.existe === false && itemC?.importarPadrao === false);
    const m11 = await rejeita(vincularProjetoNaFicha(user, { projetoId: p1.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoC.id}`, exibirEmRecebidos: false }], incluirResumo: false }));
    check("11b. o servidor recusa a chave do arquivo ausente", (m11 ?? "").includes("não foi encontrado"));
    check("11c. a recusa não deixa o projeto linkado", (await prisma.projeto.findUnique({ where: { id: p1.id }, select: { negociacaoId: true } }))?.negociacaoId === null);

    // 12. Ficha sem lead: lista vazia e o link funciona
    const previaSemLead = await previaVinculo(user, p4.id, fichaSemLead.id);
    check("12a. ficha sem lead e sem PDF: lista de arquivos vazia", previaSemLead.arquivos.length === 0 && previaSemLead.motivo === null);
    await vincularProjetoNaFicha(user, { projetoId: p4.id, negociacaoId: fichaSemLead.id, arquivos: [], incluirResumo: false });
    check("12b. link com zero arquivos grava o vínculo", (await prisma.projeto.findUnique({ where: { id: p4.id }, select: { negociacaoId: true } }))?.negociacaoId === fichaSemLead.id);

    // 14. Anexo cujo caminho aponta para fora de comercial/leads (ex.: arquivo de outro cliente) nunca é oferecido
    const docDeOutro = await prisma.documentoVersao.findFirst({ where: { documento: { projetoId: p1.id } }, select: { caminho: true } });
    const anexoForjado = await prisma.anexoLead.create({
      data: { leadId: lead.id, nome: "Forjado", caminho: docDeOutro!.caminho, nomeArquivo: "f.txt", mime: "text/plain", tamanho: 1, hashSha256: "x" },
    });
    const previaForjada = await previaVinculo(user, p1.id, ficha.id);
    check("14a. anexo com caminho fora de comercial/leads não aparece na lista", !previaForjada.arquivos.some((a) => a.chave === `lead:${anexoForjado.id}`));
    const m14 = await rejeita(vincularProjetoNaFicha(user, { projetoId: p1.id, negociacaoId: ficha.id, arquivos: [{ chave: `lead:${anexoForjado.id}`, exibirEmRecebidos: false }], incluirResumo: false }));
    check("14b. o servidor recusa a chave do anexo forjado", m14 !== null);
    await prisma.anexoLead.delete({ where: { id: anexoForjado.id } });

    // 15. A lista de projetos candidatos de uma ficha fora de Contratado vem vazia
    check("15. ficha fora de Contratado não lista projeto candidato", (await projetosLinkaveis(user, fichaAberta.id)).length === 0);

    // 13. Aceite: só trava o desfazer quando a proposta aceita é DESTA ficha (os dois caminhos gravados juntos).
    const proposta = (projetoId: string, negociacaoId: string | null, n: number) =>
      prisma.proposta.create({
        data: {
          ano: 2099, sequencial: 900000 + n + (Date.now() % 90000), numero: `${tag}-PR${n}`, titulo: `${tag} PR${n}`,
          clienteId: cliente.id, token: `${tag}-tk${n}`, autorId: usuario.id, projetoId, negociacaoId,
        },
      });
    // 13a. Projeto do aceite de proposta SEM negociação, linkado à mão depois: o desfazer tem que funcionar.
    const p5 = await novoProjeto("p5");
    projetosExtras.push(p5.id);
    await proposta(p5.id, null, 1);
    await vincularProjetoNaFicha(user, { projetoId: p5.id, negociacaoId: ficha.id, arquivos: [], incluirResumo: false });
    check("13a. linkado à mão (proposta sem ficha): desfazer funciona", (await rejeita(desvincularProjetoDaFicha(user, p5.id))) === null);
    // 13b. Projeto nascido do aceite desta ficha (proposta e projeto apontam para a mesma ficha): desfazer recusado.
    const p6 = await novoProjeto("p6");
    projetosExtras.push(p6.id);
    await prisma.projeto.update({ where: { id: p6.id }, data: { negociacaoId: ficha.id } });
    await proposta(p6.id, ficha.id, 2);
    const m13 = await rejeita(desvincularProjetoDaFicha(user, p6.id));
    check("13b. nascido do aceite desta ficha: desfazer recusado", (m13 ?? "").includes("aceite"));

    // 16. PDF de proposta: só o da versão VIGENTE. v1 com PDF + v2 sem PDF = nada a oferecer; v3 com PDF = oferecido.
    const pdf = await salvarArquivo(`comercial/propostas/${tag}-v1.pdf`, Buffer.from(`${tag} pdf v1`));
    caminhos.push(pdf.caminho);
    const prFicha = await proposta((await novoProjeto("p7")).id, ficha.id, 3);
    projetosExtras.push(prFicha.projetoId!);
    await prisma.propostaVersao.create({ data: { propostaId: prFicha.id, numero: 1, snapshot: {}, autorId: usuario.id, pdfPath: pdf.caminho } });
    await prisma.propostaVersao.create({ data: { propostaId: prFicha.id, numero: 2, snapshot: {}, autorId: usuario.id } });
    const semVigente = await previaVinculo(user, p1.id, ficha.id);
    check("16a. versão vigente sem PDF: o PDF antigo não é oferecido", !semVigente.arquivos.some((a) => a.origem === "proposta_pdf"));
    const pdf3 = await salvarArquivo(`comercial/propostas/${tag}-v3.pdf`, Buffer.from(`${tag} pdf v3`));
    caminhos.push(pdf3.caminho);
    await prisma.propostaVersao.create({ data: { propostaId: prFicha.id, numero: 3, snapshot: {}, autorId: usuario.id, pdfPath: pdf3.caminho } });
    const comVigente = await previaVinculo(user, p1.id, ficha.id);
    const itemPdf = comVigente.arquivos.find((a) => a.origem === "proposta_pdf");
    check("16b. versão vigente com PDF: oferecido com o número da versão", itemPdf?.caminho === pdf3.caminho && (itemPdf?.nome ?? "").includes("v3"));
  } finally {
    // Limpeza: documentos (e os arquivos copiados), atividades, vínculos, projetos, fichas, lead, clientes.
    const versoes = await prisma.documentoVersao.findMany({ where: { documento: { clienteId: { in: [cliente.id, cliente2.id] } } }, select: { caminho: true } });
    for (const v of versoes) await removerArquivo(v.caminho).catch(() => undefined);
    for (const c of caminhos) await removerArquivo(c).catch(() => undefined);
    await prisma.atividade.deleteMany({ where: { clienteId: { in: [cliente.id, cliente2.id] } } });
    await prisma.documento.deleteMany({ where: { clienteId: { in: [cliente.id, cliente2.id] } } });
    await prisma.propostaVersao.deleteMany({ where: { proposta: { clienteId: cliente.id } } });
    await prisma.proposta.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.projeto.deleteMany({ where: { id: { in: [p1.id, p2.id, p3.id, p4.id, ...projetosExtras] } } });
    await prisma.anexoLead.deleteMany({ where: { leadId: lead.id } });
    await prisma.negociacao.deleteMany({ where: { id: { in: [ficha.id, fichaAberta.id, fichaOutroCliente.id, fichaSemLead.id] } } });
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
    await prisma.cliente.deleteMany({ where: { id: { in: [cliente.id, cliente2.id] } } });
  }

  console.log(ok ? "\nTUDO OK" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
