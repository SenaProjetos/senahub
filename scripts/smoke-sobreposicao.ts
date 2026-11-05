/**
 * Smoke da sobreposição 2D de disciplinas (spec docs/superpowers/specs/2026-11-05-sobreposicao-disciplinas*) contra o
 * banco de dev. O vitest cobre a conta e as regras puras; aqui vai o I/O: a base que nasce com o alinhamento identidade,
 * as recusas que não gravam nada, a trava otimista do alinhamento, a revisão nova que pede conferência, o arquivo na
 * lixeira, o DWG sem conversão, o índice parcial de uma base só e a exclusão que leva camadas e alinhamentos mas deixa as
 * pendências do documento. Chama o service.ts direto (a action precisa de sessão) e a leitura com um viewer global.
 *
 * Uso: npm run smoke:sobreposicao
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { SessionUser } from "../src/lib/session";
import {
  adicionarCamadaNoBanco,
  atualizarCamadaNoBanco,
  confirmarAlinhamentoNoBanco,
  criarSobreposicaoNoBanco,
  definirBaseNoBanco,
  excluirSobreposicaoNoBanco,
  removerCamadaNoBanco,
  salvarAlinhamentoNoBanco,
} from "../src/modules/coordenacao/sobreposicao/service";
import { cenaDaSobreposicao, documentosParaCamada, sobreposicoesDoProjeto } from "../src/modules/coordenacao/sobreposicao/queries";
import { COR_BASE, PALETA_CAMADAS, estadoDoAlinhamento } from "../src/modules/coordenacao/sobreposicao/regras";

function garantirAmbienteDev() {
  let nome = "";
  try {
    nome = new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "");
  } catch {
    /* cai na recusa abaixo */
  }
  if (!/(_remake|_dev|_test|_vscode)$/i.test(nome) || process.env.NODE_ENV === "production") {
    throw new Error(`RECUSADO: o banco "${nome}" não parece de DEV. O smoke cria e apaga projeto de teste.`);
  }
}

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}
async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-sobreposicao-${Date.now()}`;
const CORRIDA = "Outra pessoa alinhou esta camada enquanto você editava. Recarregue para ver o alinhamento atual.";

async function main() {
  garantirAmbienteDev();
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true, name: true, email: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const viewer = {
    id: admin.id, name: admin.name ?? "", email: admin.email, ativo: true, tipo: "interno",
    superUsuario: true, escopoGlobalPerfil: true, perfilId: null, ehSocio: false,
  } as unknown as SessionUser;

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const seq = Number(`${Date.now()}`.slice(-5));
  const projeto = await prisma.projeto.create({
    data: { codigo: `SB${seq}`, ano: new Date().getFullYear(), sequencial: seq, nome: `${tag}-projeto`, clienteId: cliente.id },
  });
  const outro = await prisma.projeto.create({
    data: { codigo: `SC${seq}`, ano: new Date().getFullYear(), sequencial: seq + 1, nome: `${tag}-outro`, clienteId: cliente.id },
  });

  try {
    // Documento de disciplina com uma revisão e os arquivos pedidos (sem disco: nada aqui lê o arquivo).
    const novoDocumento = async (projetoId: string, disc: string, arquivos: string[]) => {
      const d = await prisma.disciplina.create({ data: { projetoId, disciplinaTextoLegado: disc } });
      const doc = await prisma.documentoDisciplina.create({
        data: { disciplinaId: d.id, chave: `A/${disc}`, nomeArquivo: arquivos[0], titulo: `Planta ${disc}` },
      });
      const rev = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 1 } });
      const uploads: Record<string, string> = {};
      for (const nome of arquivos) {
        const u = await prisma.upload.create({
          data: {
            disciplinaId: d.id, pacote: "A", nomeArquivo: nome, caminho: `tmp/${tag}/${nome}`, hashSha256: "x", tamanho: 1,
            autorId: admin.id, documentoId: doc.id, revisaoId: rev.id,
          },
        });
        uploads[nome.slice(-3).toLowerCase()] = u.id;
      }
      return { disciplinaId: d.id, documentoId: doc.id, uploads };
    };
    const arq = await novoDocumento(projeto.id, "Arquitetura", ["arq.pdf"]);
    const est = await novoDocumento(projeto.id, "Estrutural", ["est.pdf", "est.dwg"]);
    const hid = await novoDocumento(projeto.id, "Hidráulica", ["hid.pdf"]);
    const alheio = await novoDocumento(outro.id, "Elétrica", ["ele.pdf"]);

    const { id: sobreposicaoId } = await criarSobreposicaoNoBanco(prisma, { projetoId: projeto.id, nome: "Pavimento tipo" }, admin.id);
    const repetida = await erroDe(() => criarSobreposicaoNoBanco(prisma, { projetoId: projeto.id, nome: "Pavimento tipo" }, admin.id));
    check("nome repetido no projeto é recusado", repetida === "Já existe uma sobreposição com esse nome neste projeto.", repetida);
    const docs = await documentosParaCamada(projeto.id);
    check("documentosParaCamada lista os três do projeto com PDF/DWG", docs.length === 3 && docs.find((d) => d.documentoId === est.documentoId)?.temDwg === true && docs.find((d) => d.documentoId === arq.documentoId)?.temDwg === false, docs);

    // ── 1. a primeira camada vira base com alinhamento identidade conferido ──
    const { id: camadaArq } = await adicionarCamadaNoBanco(prisma, { sobreposicaoId, documentoId: arq.documentoId, formato: "pdf" }, admin.id);
    const c1 = await prisma.sobreposicaoCamada.findUniqueOrThrow({ where: { id: camadaArq }, include: { alinhamentos: true } });
    const a1 = c1.alinhamentos[0];
    check(
      "1. primeira camada é base, cor da base, alinhamento identidade conferido no PDF vigente",
      c1.base && c1.cor === COR_BASE && c1.alinhamentos.length === 1 && a1.formato === "pdf" && a1.tx === 0 && a1.ty === 0 && a1.giro === 0 && a1.escala === 1 && a1.uploadConferidoId === arq.uploads.pdf && a1.versao === 1,
      c1,
    );

    // ── 2. a segunda camada não é base e não tem alinhamento ──
    const { id: camadaEst } = await adicionarCamadaNoBanco(prisma, { sobreposicaoId, documentoId: est.documentoId, formato: "pdf" }, admin.id);
    const c2 = await prisma.sobreposicaoCamada.findUniqueOrThrow({ where: { id: camadaEst }, include: { alinhamentos: true } });
    check("2. segunda camada não é base, sem alinhamento, cor da paleta", !c2.base && c2.alinhamentos.length === 0 && c2.cor === PALETA_CAMADAS[0] && c2.ordem > c1.ordem, c2);
    const dupla = await erroDe(() => adicionarCamadaNoBanco(prisma, { sobreposicaoId, documentoId: est.documentoId, formato: "pdf" }, admin.id));
    check("   mesmo documento duas vezes é recusado", dupla === "Este documento já está nesta sobreposição.", dupla);

    // ── 3. documento de outro projeto → recusa, nada gravado ──
    const antes3 = await prisma.sobreposicaoCamada.count({ where: { sobreposicaoId } });
    const r3 = await erroDe(() => adicionarCamadaNoBanco(prisma, { sobreposicaoId, documentoId: alheio.documentoId, formato: "pdf" }, admin.id));
    const depois3 = await prisma.sobreposicaoCamada.count({ where: { sobreposicaoId } });
    check("3. documento de outro projeto é recusado e nada é gravado", r3 === "Este documento não é deste projeto." && antes3 === depois3, { r3, antes3, depois3 });

    // ── 4. DWG em documento só com PDF → recusa ──
    const r4 = await erroDe(() => adicionarCamadaNoBanco(prisma, { sobreposicaoId, documentoId: hid.documentoId, formato: "dwg" }, admin.id));
    const depois4 = await prisma.sobreposicaoCamada.count({ where: { sobreposicaoId } });
    check("4. DWG em documento só com PDF é recusado e nada é gravado", r4 === "Este documento não tem arquivo DWG vigente." && depois4 === antes3, { r4, depois4 });
    const { id: camadaHid } = await adicionarCamadaNoBanco(prisma, { sobreposicaoId, documentoId: hid.documentoId, formato: "pdf" }, admin.id);

    // ── 5. trava otimista do alinhamento ──
    const al = { tx: 10, ty: -5, giro: 90, escala: 2 };
    await salvarAlinhamentoNoBanco(prisma, { camadaId: camadaEst, formato: "pdf", alinhamento: al, versaoLida: null }, admin.id);
    const criarDeNovo = await erroDe(() => salvarAlinhamentoNoBanco(prisma, { camadaId: camadaEst, formato: "pdf", alinhamento: al, versaoLida: null }, admin.id));
    await salvarAlinhamentoNoBanco(prisma, { camadaId: camadaEst, formato: "pdf", alinhamento: { ...al, tx: 11 }, versaoLida: 1 }, admin.id);
    const velha = await erroDe(() => salvarAlinhamentoNoBanco(prisma, { camadaId: camadaEst, formato: "pdf", alinhamento: { ...al, tx: 12 }, versaoLida: 1 }, admin.id));
    const a5 = await prisma.sobreposicaoAlinhamento.findUniqueOrThrow({ where: { camadaId_formato: { camadaId: camadaEst, formato: "pdf" } } });
    check(
      "5. versão lida velha (e criar de novo) dá a mensagem de corrida; o salvo fica",
      velha === CORRIDA && criarDeNovo === CORRIDA && a5.versao === 2 && a5.tx === 11 && a5.uploadConferidoId === est.uploads.pdf,
      { velha, criarDeNovo, a5 },
    );

    // ── 6. revisão nova do PDF da base → revisao_anterior só nela (R1); confirmar → alinhada ──
    const rev2 = await prisma.documentoRevisao.create({ data: { documentoId: arq.documentoId, numero: 2 } });
    const arqV2 = await prisma.upload.create({
      data: {
        disciplinaId: arq.disciplinaId, pacote: "A", nomeArquivo: "arq.pdf", versao: 2, caminho: `tmp/${tag}/arq-v2.pdf`, hashSha256: "y", tamanho: 1,
        autorId: admin.id, documentoId: arq.documentoId, revisaoId: rev2.id,
      },
    });
    let cena = await cenaDaSobreposicao(sobreposicaoId, viewer);
    const base6 = cena?.camadas.find((c) => c.id === camadaArq);
    const est6 = cena?.camadas.find((c) => c.id === camadaEst);
    const ok6a = base6?.alinhamentos.pdf?.estado === "revisao_anterior" && base6.alinhamentos.pdf.revisaoConferida === "R00" && base6.pdf?.uploadId === arqV2.id && base6.pdf.revisao === "R01" && est6?.alinhamentos.pdf?.estado === "alinhada";
    await confirmarAlinhamentoNoBanco(prisma, { camadaId: camadaArq, formato: "pdf", versaoLida: 1 }, admin.id);
    cena = await cenaDaSobreposicao(sobreposicaoId, viewer);
    const base6b = cena?.camadas.find((c) => c.id === camadaArq);
    check(
      "6. revisão nova da base → revisao_anterior só nela; confirmar → alinhada",
      ok6a && base6b?.alinhamentos.pdf?.estado === "alinhada" && base6b.alinhamentos.pdf.versao === 2 && base6b.alinhamentos.pdf.revisaoConferida === "R01",
      { base6: base6?.alinhamentos, est6: est6?.alinhamentos, base6b: base6b?.alinhamentos },
    );

    // ── 7. PDF na lixeira → pdf: null nessa camada, as outras normais ──
    await prisma.upload.update({ where: { id: hid.uploads.pdf }, data: { excluidoEm: new Date(), excluidoPorId: admin.id } });
    cena = await cenaDaSobreposicao(sobreposicaoId, viewer);
    const hid7 = cena?.camadas.find((c) => c.id === camadaHid);
    check(
      "7. PDF na lixeira → pdf null nessa camada; as outras vêm normais",
      cena?.camadas.length === 3 && hid7?.pdf === null && cena.camadas.filter((c) => c.id !== camadaHid).every((c) => c.pdf !== null),
      cena?.camadas.map((c) => [c.titulo, c.pdf?.uploadId ?? null]),
    );

    // ── 8. DWG sem ConversaoDesenho → sem_conversao ──
    await atualizarCamadaNoBanco(prisma, { camadaId: camadaEst, formato: "dwg" });
    const semPdf = await erroDe(() => atualizarCamadaNoBanco(prisma, { camadaId: camadaHid, formato: "dwg" }));
    cena = await cenaDaSobreposicao(sobreposicaoId, viewer);
    const est8 = cena?.camadas.find((c) => c.id === camadaEst);
    check(
      "8. DWG sem conversão → dwg.status sem_conversao (e trocar para DWG sem arquivo é recusado)",
      est8?.formato === "dwg" && est8.dwg?.status === "sem_conversao" && est8.dwg.desenhoId === est.uploads.dwg && est8.alinhamentos.dwg === undefined && semPdf === "Este documento não tem arquivo DWG vigente.",
      { est8: est8?.dwg, semPdf },
    );

    // ── 9. base: não remove com outra camada; definirBase troca; o índice nunca deixa duas ──
    const r9 = await erroDe(() => removerCamadaNoBanco(prisma, { camadaId: camadaArq }));
    await definirBaseNoBanco(prisma, { camadaId: camadaEst });
    const bases = await prisma.sobreposicaoCamada.findMany({ where: { sobreposicaoId, base: true }, select: { id: true, cor: true } });
    const duas = await erroDe(() => prisma.sobreposicaoCamada.update({ where: { id: camadaArq }, data: { base: true } }));
    const al9 = await prisma.sobreposicaoAlinhamento.findUnique({ where: { camadaId_formato: { camadaId: camadaEst, formato: "dwg" } } });
    const alArq9 = await prisma.sobreposicaoAlinhamento.findUniqueOrThrow({ where: { camadaId_formato: { camadaId: camadaArq, formato: "pdf" } } });
    check(
      "9. remover a base é recusado; definirBase troca sem recolorir nem inventar alinhamento (R5) e o índice parcial barra duas bases",
      r9 === "Defina outra camada como base antes de remover esta." && bases.length === 1 && bases[0].id === camadaEst && bases[0].cor === PALETA_CAMADAS[0] && duas !== null && al9 === null && alArq9.versao === 2,
      { r9, bases, duas, al9 },
    );
    // A base troca de formato para um sem alinhamento: continua sem alinhamento (R5) — nada de identidade inventada.
    await atualizarCamadaNoBanco(prisma, { camadaId: camadaEst, formato: "pdf" });
    await atualizarCamadaNoBanco(prisma, { camadaId: camadaEst, formato: "dwg" });
    cena = await cenaDaSobreposicao(sobreposicaoId, viewer);
    const base9 = cena?.camadas.find((c) => c.id === camadaEst);
    // Na cena "sem_alinhamento" é a chave ausente do formato (o tipo é Partial); é o que a tela lê.
    const doFormato = base9 ? base9.alinhamentos[base9.formato] : undefined;
    const estadoBase9 = estadoDoAlinhamento(doFormato ? { uploadConferidoId: null } : null, base9?.dwg?.uploadId ?? null);
    const linhasDwg = await prisma.sobreposicaoAlinhamento.count({ where: { camadaId: camadaEst, formato: "dwg" } });
    check(
      "   base que troca para formato sem alinhamento fica sem_alinhamento na cena",
      base9?.base === true && base9.formato === "dwg" && base9.alinhamentos.dwg === undefined && base9.alinhamentos.pdf?.versao === 2 && estadoBase9 === "sem_alinhamento" && linhasDwg === 0,
      { alinhamentos: base9?.alinhamentos, linhasDwg },
    );
    await removerCamadaNoBanco(prisma, { camadaId: camadaArq });
    check("   a ex-base agora sai", (await prisma.sobreposicaoCamada.count({ where: { sobreposicaoId } })) === 2);

    // ── 10. pinos na cena e exclusão que leva camadas/alinhamentos e deixa a Pendencia ──
    const pend = async (numero: number, extra: { publicadoEm: Date | null; autorId: string; status?: string; pagina?: number }) =>
      prisma.pendencia.create({
        data: {
          uploadId: est.uploads.pdf, disciplinaId: est.disciplinaId, projetoId: projeto.id, documentoId: est.documentoId, numero,
          pagina: extra.pagina ?? 1, x: 0.25, y: 0.5, texto: `${tag} #${numero}`, status: extra.status ?? "aberta",
          autorId: extra.autorId, publicadoEm: extra.publicadoEm,
        },
      });
    const publicada = await pend(1, { publicadoEm: new Date(), autorId: `${tag}-outro` });
    const meuRascunho = await pend(2, { publicadoEm: null, autorId: admin.id });
    await pend(3, { publicadoEm: null, autorId: `${tag}-outro` }); // rascunho alheio: fora
    await pend(4, { publicadoEm: new Date(), autorId: admin.id, status: "fechada" }); // fechada: fora
    await pend(5, { publicadoEm: new Date(), autorId: admin.id, pagina: 2 }); // outra página: fora
    cena = await cenaDaSobreposicao(sobreposicaoId, viewer);
    const pinos = cena?.camadas.find((c) => c.id === camadaEst)?.pinos ?? [];
    check(
      "   pinos: abertos da página, rascunho só o meu",
      pinos.length === 2 && pinos.some((p) => p.id === publicada.id && !p.rascunho && !p.meu) && pinos.some((p) => p.id === meuRascunho.id && p.rascunho && p.meu),
      pinos,
    );
    check("   sobreposicoesDoProjeto conta as camadas", JSON.stringify(await sobreposicoesDoProjeto(projeto.id)) === JSON.stringify([{ id: sobreposicaoId, nome: "Pavimento tipo", camadas: 2 }]));
    await excluirSobreposicaoNoBanco(prisma, { id: sobreposicaoId });
    const restoCamadas = await prisma.sobreposicaoCamada.count({ where: { sobreposicaoId } });
    const restoAl = await prisma.sobreposicaoAlinhamento.count({ where: { camadaId: { in: [camadaArq, camadaEst, camadaHid] } } });
    const restoPend = await prisma.pendencia.count({ where: { documentoId: est.documentoId, excluidoEm: null } });
    check("10. excluir a sobreposição leva camadas e alinhamentos; as pendências ficam", restoCamadas === 0 && restoAl === 0 && restoPend === 5, { restoCamadas, restoAl, restoPend });
    check("   cena de sobreposição excluída é null", (await cenaDaSobreposicao(sobreposicaoId, viewer)) === null);
  } finally {
    const passo = async (nome: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.log(`  (limpeza: ${nome} falhou: ${e instanceof Error ? e.message : e})`);
      }
    };
    const ids = [projeto.id, outro.id];
    await passo("pendências", () => prisma.pendencia.deleteMany({ where: { projetoId: { in: ids } } }));
    await passo("sobreposições", () => prisma.sobreposicaoPlanta.deleteMany({ where: { projetoId: { in: ids } } }));
    await passo("uploads", () =>
      prisma.upload.deleteMany({ where: { disciplina: { projetoId: { in: ids } }, excluidoEm: { not: undefined }, substituidoPorId: { not: undefined } } }),
    );
    await passo("disciplinas", () => prisma.disciplina.deleteMany({ where: { projetoId: { in: ids } } }));
    await passo("projetos", () => prisma.projeto.deleteMany({ where: { id: { in: ids } } }));
    await passo("cliente", () => prisma.cliente.delete({ where: { id: cliente.id } }));
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
