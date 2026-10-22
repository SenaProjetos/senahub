/**
 * Smoke do ciclo documental (ISO 19650) contra o banco de dev — o I/O que o vitest não cobre: transação,
 * evento dentro dela, índice parcial (I4), ponteiros das pastas do cliente, restrição dos apontamentos,
 * liberação automática e a verificação de integridade corrigindo uma violação provocada de propósito.
 *
 *   npm run smoke:ciclo-documental
 *
 * Cria um cliente/projeto descartáveis (tag SMKCICLO_*) e apaga tudo no fim.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import {
  aplicarControleNoBanco,
  devolverNoBanco,
  enviarParaAnaliseNoBanco,
  liberarRestricaoDePendencias,
  motivoBloqueioDosUploads,
  motivoExclusaoProtegida,
  publicarNoBanco,
  removerControleNoBanco,
  documentosPendentesDePublicacao,
} from "../src/modules/uploads/ciclo/service";
import { verificarEnvioParaAnalise } from "../src/modules/uploads/ciclo/envio-analise";
import { lerCarimboDoArquivo } from "../src/modules/uploads/ciclo/carimbo-servidor";
import { conferirCarimbo } from "../src/modules/uploads/ciclo/carimbo";
import {
  MOTIVO_DESCRICAO_DIGITADA_GENERICA,
  motivoDescricaoGenerica,
  motivoDescricaoVazia,
} from "../src/modules/uploads/ciclo/envio-regras";
import { verificarIntegridadeCiclo } from "../src/modules/uploads/ciclo/integridade-service";
import { MOTIVO_CORRECAO_INTEGRIDADE } from "../src/modules/uploads/ciclo/integridade";
import { MOTIVO_SEM_DWG_SEM_TIPO } from "../src/modules/uploads/ciclo/regras";
import { conteudoPublicoPorToken, type ConteudoPublico } from "../src/modules/projetos/arquivos/link-publico";

async function main() {
  const tag = `SMKCICLO_${Date.now()}`;
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
  const quem = { userId: usuario.id };

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
  // Os checks antigos (N4 por herança) rodam com o envio automático DESLIGADO; o padrão novo tem bloco próprio.
  const config = (c: { liberar?: boolean; pendencias?: boolean; enviar?: boolean }) => {
    const dados = {
      liberarObraAutomaticamente: c.liberar ?? false,
      permitirPublicarComPendencias: c.pendencias ?? false,
      enviarAoClienteAutomaticamente: c.enviar ?? false,
    };
    return prisma.configDocumentosProjeto.upsert({ where: { projetoId: projeto.id }, create: { projetoId: projeto.id, ...dados }, update: dados });
  };
  // O DWG obrigatório é do TIPO do documento. Os documentos do smoke publicam só com PDF, então nascem num
  // tipo que não exige; o caso do DWG usa um tipo que exige. Tipos do próprio projeto (somem com ele).
  const tipoSemDwg = await prisma.pranchaCatalogo.create({
    data: { categoria: "tipo", sigla: "SMKN", nome: `${tag} sem DWG`, projetoId: projeto.id, exigeDwg: false },
  });
  const tipoComDwg = await prisma.pranchaCatalogo.create({
    data: { categoria: "tipo", sigla: "SMKD", nome: `${tag} com DWG`, projetoId: projeto.id, exigeDwg: true },
  });

  let n = 0;
  async function documento(nome: string) {
    return prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `A/${tag}-${nome}`, nomeArquivo: `${tag}-${nome}.pdf`, tipoId: tipoSemDwg.id },
    });
  }
  async function revisao(documentoId: string, numero: number, opts: { validado?: boolean; dwg?: boolean } = {}) {
    const r = await prisma.documentoRevisao.create({ data: { documentoId, numero, createdById: usuario!.id } });
    const exts = opts.dwg ? ["pdf", "dwg"] : ["pdf"];
    const uploads = [];
    for (const ext of exts) {
      uploads.push(
        await prisma.upload.create({
          data: {
            disciplinaId,
            documentoId,
            revisaoId: r.id,
            pacote: "A",
            versao: ++n,
            nomeArquivo: `${tag}-doc.${ext}`,
            caminho: `smoke/${tag}-${n}.${ext}`,
            tamanho: 10,
            hashSha256: `${n}`.padStart(64, "0"),
            validado: opts.validado ?? false,
            autorId: usuario!.id,
          },
        }),
      );
    }
    return { ...r, uploads };
  }
  const estado = async (id: string) => (await prisma.documentoRevisao.findUnique({ where: { id }, select: { estado: true } }))?.estado;
  const ativos = async (id: string) =>
    (await prisma.controleRevisao.findMany({ where: { revisaoId: id, removidoEm: null }, select: { tipo: true, origem: true } })).map((c) => c.tipo);
  // Link público "por situação" (as pastas Compartilhado e Liberado para obra): o que o cliente e a obra veem.
  const tokenLink = `${tag}_link`;
  const arquivosNoLink = async () => {
    const conteudo: ConteudoPublico | null = await conteudoPublicoPorToken(tokenLink);
    return (conteudo?.situacoes ?? []).flatMap((s) =>
      s.disciplinas.flatMap((d) => d.pastas.flatMap((f) => f.extensoes.flatMap((e) => e.arquivos.map((a) => ({ situacao: s.id, ...a }))))),
    );
  };

  try {
    await config({});

    // ── I1 e transições básicas ──
    const d1 = await documento("um");
    const r1 = await revisao(d1.id, 1, { dwg: true });
    check("I1: revisão nova nasce em andamento", (await estado(r1.id)) === "em_andamento");

    const a4 = await recusa(() =>
      prisma.$transaction(async (tx) => {
        const { carregarRevisao } = await import("../src/modules/uploads/ciclo/service");
        await verificarEnvioParaAnalise(await carregarRevisao(tx, r1.id), tx, {
          carimbo: null,
          confirmarSemCarimbo: false,
          contestarCarimbo: false,
          userId: usuario.id,
        });
      }),
    );
    check("A4: nome fora da nomenclatura é recusado com o que corrigir", a4 !== null && /nome/i.test(a4));

    // Nomenclatura livre (licitação segue o padrão do órgão): o mesmo nome passa, e a revisão do carimbo
    // (R01 com o sistema esperando R00) também não bloqueia.
    await prisma.nomenclaturaConfig.create({ data: { projetoId: projeto.id, exigir: false, exigirFase: false } });
    const livre = await recusa(() =>
      prisma.$transaction(async (tx) => {
        const { carregarRevisao } = await import("../src/modules/uploads/ciclo/service");
        await verificarEnvioParaAnalise(await carregarRevisao(tx, r1.id), tx, {
          carimbo: { leitura: { temTexto: true, codigos: [], revisao: 1, quadro: null }, nomeArquivo: `${tag}-doc.pdf` },
          confirmarSemCarimbo: false,
          contestarCarimbo: false,
          userId: usuario.id,
        });
      }),
    );
    check("nomenclatura livre: nome e revisão do carimbo não bloqueiam o envio", livre === null);

    // Descrição da R01 lida do quadro de revisão do carimbo (ainda em nomenclatura livre, para o nome do
    // smoke não bloquear): linha vazia/genérica bloqueia, contestar grava o digitado e o que o carimbo dizia.
    const dDesc = await documento("descricao");
    const rDesc = await revisao(dDesc.id, 2);
    const leituraR01 = (texto: string) => ({
      temTexto: true,
      codigos: [],
      revisao: 1,
      quadro: { linhas: [{ numero: 0, texto: "EMISSÃO INICIAL" }, { numero: 1, texto }] },
    });
    const enviarR01 = (texto: string, extra: { descricao?: string; contestar?: boolean } = {}) =>
      enviarParaAnaliseNoBanco({
        revisaoId: rDesc.id,
        quem,
        descricao: extra.descricao,
        verificar: (rev, tx) =>
          verificarEnvioParaAnalise(rev, tx, {
            carimbo: { leitura: leituraR01(texto), nomeArquivo: `${tag}-doc.pdf` },
            confirmarSemCarimbo: false,
            contestarCarimbo: extra.contestar ?? false,
            userId: usuario.id,
          }),
      });
    const revDesc = () =>
      prisma.documentoRevisao.findUniqueOrThrow({ where: { id: rDesc.id }, select: { descricao: true, descricaoOrigem: true, descricaoCarimbo: true } });
    check("descrição do carimbo: linha vazia bloqueia", (await recusa(() => enviarR01(""))) === motivoDescricaoVazia("R01"));
    check("descrição do carimbo: texto genérico bloqueia", (await recusa(() => enviarR01("REVISÕES"))) === motivoDescricaoGenerica("REVISÕES"));
    check(
      "descrição do carimbo: contestar com texto genérico também bloqueia",
      (await recusa(() => enviarR01("REVISÕES", { contestar: true, descricao: "Ajustes" }))) === MOTIVO_DESCRICAO_DIGITADA_GENERICA,
    );
    await enviarR01("REVISÕES", { contestar: true, descricao: "Ajuste da laje L3" });
    const contestada = await revDesc();
    check(
      "descrição contestada: fica o digitado e o que o carimbo dizia",
      (await estado(rDesc.id)) === "compartilhado" &&
        contestada.descricao === "Ajuste da laje L3" &&
        contestada.descricaoOrigem === "contestada" &&
        contestada.descricaoCarimbo === "REVISÕES",
    );
    const eventoContestado = await prisma.documentoEvento.findFirst({
      where: { revisaoId: rDesc.id, tipo: "estado" },
      orderBy: { createdAt: "desc" },
      select: { detalhe: true },
    });
    const detalheDesc = (eventoContestado?.detalhe as { descricao?: { origem?: string; lido?: string | null; digitado?: string } } | null)?.descricao;
    check(
      "descrição contestada: o evento de estado guarda lido e digitado",
      detalheDesc?.origem === "contestada" && detalheDesc.lido === "REVISÕES" && detalheDesc.digitado === "Ajuste da laje L3",
    );
    await devolverNoBanco({ revisaoId: rDesc.id, quem, motivo: "Conferir o carimbo" });
    await enviarR01("AJUSTE DAS COTAS DO TÉRREO");
    const lida = await revDesc();
    check(
      "descrição lida do carimbo substitui a digitada e limpa a contestação",
      lida.descricao === "AJUSTE DAS COTAS DO TÉRREO" && lida.descricaoOrigem === "carimbo" && lida.descricaoCarimbo === null,
    );
    // O documento fica em análise: sem arquivo vivo, ele sai da conta do 6-B mais abaixo.
    await prisma.upload.updateMany({ where: { revisaoId: rDesc.id }, data: { excluidoEm: new Date() } });
    await prisma.nomenclaturaConfig.delete({ where: { projetoId: projeto.id } });

    // Carimbo, lido no SERVIDOR (pdfjs legacy) de um PDF real do acervo de dev: o carimbo diz
    // 260024-EST-BS-4004-DT / REVISÃO 00, e o arquivo está como 260004-EST-EX-4004-DTC.
    const pdfReal = "2026/Loteamentos_Sul_Empreendimentos/260004_Galpao_Industrial_Jundiai/EST/A/EST-260004-EST-EX-4004-DTC.pdf";
    const leituraReal = await lerCarimboDoArquivo(pdfReal);
    if (leituraReal.temTexto) {
      check("carimbo real: lê código e revisão", leituraReal.codigos.includes("260024-EST-BS-4004-DT") && leituraReal.revisao === 0);
      const conf = conferirCarimbo(leituraReal, { nomeArquivo: "260004-EST-EX-4004-DTC.pdf", numero: 1 });
      check("carimbo real: código divergente vira problema", conf.problemas.some((p) => p.includes("260024-EST-BS-4004-DT")));
    } else {
      console.log("[--] PDF real do acervo não encontrado no storage; leitura do carimbo não exercitada.");
    }
    const sumido = await lerCarimboDoArquivo("nao-existe/arquivo.pdf");
    check("carimbo: arquivo ausente vira leitura falha (pede confirmação), sem lançar", !sumido.temTexto);

    await enviarParaAnaliseNoBanco({ revisaoId: r1.id, quem });
    check("enviar para análise → em análise", (await estado(r1.id)) === "compartilhado");
    check("I8: a transição gravou evento com a revisão", (await prisma.documentoEvento.count({ where: { revisaoId: r1.id, tipo: "estado" } })) === 1);

    check("A8: devolver sem motivo é recusado", (await recusa(() => devolverNoBanco({ revisaoId: r1.id, quem, motivo: " " }))) !== null);
    await devolverNoBanco({ revisaoId: r1.id, quem, motivo: "Cotas faltando" });
    check("A8: devolver com motivo → em andamento", (await estado(r1.id)) === "em_andamento");
    await enviarParaAnaliseNoBanco({ revisaoId: r1.id, quem });

    // ── DWG obrigatório pelo tipo: a R00 tem PDF+DWG; sem o DWG, recusa ──
    await prisma.documentoDisciplina.update({ where: { id: d1.id }, data: { tipoId: tipoComDwg.id } });
    const dwgUpload = r1.uploads.find((u) => u.nomeArquivo.endsWith(".dwg"))!;
    await prisma.upload.update({ where: { id: dwgUpload.id }, data: { excluidoEm: new Date() } });
    check("DWG obrigatório (tipo que exige): sem o DWG a publicação é recusada", /DWG/.test((await recusa(() => publicarNoBanco({ revisaoId: r1.id, quem }))) ?? ""));
    await prisma.upload.update({ where: { id: dwgUpload.id }, data: { excluidoEm: null } });
    await prisma.documentoDisciplina.update({ where: { id: d1.id }, data: { tipoId: tipoSemDwg.id } });

    // ── Documento SEM tipo e sem DWG (memorial, planilha; decisão do dono 2026-10-21): pede confirmação ──
    const dSemTipo = await documento("sem-tipo");
    await prisma.documentoDisciplina.update({ where: { id: dSemTipo.id }, data: { tipoId: null } });
    const rSemTipo = await revisao(dSemTipo.id, 1, { validado: true });
    await enviarParaAnaliseNoBanco({ revisaoId: rSemTipo.id, quem });
    check(
      "sem tipo e sem DWG: publicar sem confirmar é recusado com a frase da tela",
      (await recusa(() => publicarNoBanco({ revisaoId: rSemTipo.id, quem }))) === MOTIVO_SEM_DWG_SEM_TIPO,
    );
    await publicarNoBanco({ revisaoId: rSemTipo.id, quem, confirmarSemDwg: true });
    check("sem tipo e sem DWG: com a confirmação, publica", (await estado(rSemTipo.id)) === "publicado");
    check(
      "sem tipo e sem DWG: a confirmação vira evento no histórico, na mesma transação",
      (await prisma.documentoEvento.count({ where: { revisaoId: rSemTipo.id, tipo: "publicacao_sem_dwg" } })) === 1,
    );

    // ── D2-a: só publica com tudo validado ──
    check("D2-a: arquivo sem validação impede publicar", /Valide/.test((await recusa(() => publicarNoBanco({ revisaoId: r1.id, quem }))) ?? ""));
    await prisma.upload.updateMany({ where: { revisaoId: r1.id }, data: { validado: true } });

    // ── I7: bloqueio impede transição ──
    const bloq = await aplicarControleNoBanco({ revisaoId: r1.id, tipo: "bloqueio", quem, motivo: "Aguardando ART", escopos: ["download", "exclusao"] });
    check("I7: bloqueio impede publicar", /bloqueada/.test((await recusa(() => publicarNoBanco({ revisaoId: r1.id, quem }))) ?? ""));
    check("I7: bloqueio de download vale para os arquivos", (await motivoBloqueioDosUploads(prisma, [r1.uploads[0].id], "download")) !== null);
    const controleBloq = await prisma.controleRevisao.findFirst({ where: { revisaoId: r1.id, tipo: "bloqueio", removidoEm: null }, select: { id: true } });
    await removerControleNoBanco({ controleId: controleBloq!.id, quem, motivo: "ART recolhida" });
    check("bloqueio removido fica no histórico (não é apagado)", (await prisma.controleRevisao.count({ where: { revisaoId: r1.id, tipo: "bloqueio" } })) === 1 && bloq.tipo === "bloqueio");

    // ── publicar sem liberação automática ──
    const pub1 = await publicarNoBanco({ revisaoId: r1.id, quem });
    check("publicar → publicado", (await estado(r1.id)) === "publicado");
    check("A2 desligada: não libera para obra", pub1.liberacaoObra === "nao_configurado" && !(await ativos(r1.id)).includes("liberado_obra"));
    check("I2: publicado não volta (devolver recusado)", /nova revisão/.test((await recusa(() => devolverNoBanco({ revisaoId: r1.id, quem, motivo: "x" }))) ?? ""));
    check("I6: arquivo de revisão publicada não exclui (não admin)", (await motivoExclusaoProtegida(prisma, [r1.uploads[0].id], { ehAdmin: false })) !== null);
    check("I6/D5-b: admin com motivo exclui", (await motivoExclusaoProtegida(prisma, [r1.uploads[0].id], { ehAdmin: true, motivo: "Erro de envio" })) === null);

    // Liberação e envio ao cliente à mão (só em publicada — I5).
    await aplicarControleNoBanco({ revisaoId: r1.id, tipo: "liberado_obra", quem, motivo: "Liberado pelo RT" });
    await aplicarControleNoBanco({ revisaoId: r1.id, tipo: "enviado_cliente", quem, motivo: "Para aprovação do cliente" });
    const ponteiros1 = await prisma.documentoDisciplina.findUnique({ where: { id: d1.id }, select: { revisaoCompartilhadaId: true, revisaoLiberadaObraId: true } });
    check("pastas do cliente espelham os controles", ponteiros1?.revisaoCompartilhadaId === r1.id && ponteiros1?.revisaoLiberadaObraId === r1.id);

    // ── A1 + N4 + A2: publicar a R01 (número 2) ──
    await config({ liberar: true });
    const r2 = await revisao(d1.id, 2, { validado: true });
    check("I5: liberar revisão não publicada é recusado", /publicada/.test((await recusa(() => aplicarControleNoBanco({ revisaoId: r2.id, tipo: "liberado_obra", quem, motivo: "x" }))) ?? ""));
    await enviarParaAnaliseNoBanco({ revisaoId: r2.id, quem });
    const pub2 = await publicarNoBanco({ revisaoId: r2.id, quem });
    const r1Liberado = await prisma.controleRevisao.findFirst({ where: { revisaoId: r1.id, tipo: "liberado_obra" }, select: { removidoEm: true } });
    check("A1: a publicada anterior foi arquivada", (await estado(r1.id)) === "arquivado");
    check("A1: e perdeu a liberação para obra na mesma operação", r1Liberado?.removidoEm != null && pub2.substituidas[0]?.perdeuLiberacaoObra === true);
    check("N4: o envio ao cliente passou para a nova", pub2.envioAoCliente === "herdado" && (await ativos(r2.id)).includes("enviado_cliente"));
    check("A2 ligada e sem restrição: a nova foi liberada para obra", pub2.liberacaoObra === "liberada" && (await ativos(r2.id)).includes("liberado_obra"));
    const ponteiros2 = await prisma.documentoDisciplina.findUnique({ where: { id: d1.id }, select: { revisaoCompartilhadaId: true, revisaoLiberadaObraId: true } });
    check("ponteiros das pastas do cliente seguem a nova revisão", ponteiros2?.revisaoCompartilhadaId === r2.id && ponteiros2?.revisaoLiberadaObraId === r2.id);
    check("I4: só uma publicada no documento", (await prisma.documentoRevisao.count({ where: { documentoId: d1.id, estado: "publicado" } })) === 1);
    const i4 = await recusa(() => prisma.documentoRevisao.update({ where: { id: r1.id }, data: { estado: "publicado" } }));
    check("I4: o banco recusa uma segunda publicada", i4 !== null);

    // ── A3: apontamentos ──
    const d2 = await documento("dois");
    const r3 = await revisao(d2.id, 1, { validado: true });
    const pend = await prisma.pendencia.create({
      data: {
        uploadId: r3.uploads[0].id,
        documentoId: d2.id,
        disciplinaId,
        projetoId: projeto.id,
        numero: 1,
        pagina: 1,
        x: 0.5,
        y: 0.5,
        texto: "Cota divergente",
        severidade: "media",
        publicadoEm: new Date(),
        autorId: usuario.id,
      },
    });
    await enviarParaAnaliseNoBanco({ revisaoId: r3.id, quem });
    await config({ liberar: true, pendencias: false });
    check("A3: com pendência e projeto que não permite, não publica", /apontamento/.test((await recusa(() => publicarNoBanco({ revisaoId: r3.id, quem }))) ?? ""));
    await config({ liberar: true, pendencias: true });
    check("A3: permitido, mas sem justificativa, não publica", /justificativa/.test((await recusa(() => publicarNoBanco({ revisaoId: r3.id, quem }))) ?? ""));
    const pub3 = await publicarNoBanco({ revisaoId: r3.id, quem, justificativa: "Prazo da obra" });
    check("A3: publicado com justificativa ganha restrição automática", pub3.restricaoPendencias && (await ativos(r3.id)).includes("restricao"));
    check("A2 com restrição: NÃO libera para obra (e avisa)", pub3.liberacaoObra === "restricao" && !(await ativos(r3.id)).includes("liberado_obra"));
    check("restrição dos apontamentos não sai enquanto houver pendência", (await liberarRestricaoDePendencias(d2.id)) === 0);
    await prisma.pendencia.update({ where: { id: pend.id }, data: { status: "fechada" } });
    check("A3: resolvida a última pendência, a restrição sai sozinha", (await liberarRestricaoDePendencias(d2.id)) === 1 && !(await ativos(r3.id)).includes("restricao"));

    const d3 = await documento("tres");
    const r4 = await revisao(d3.id, 1, { validado: true });
    await prisma.pendencia.create({
      data: { uploadId: r4.uploads[0].id, documentoId: d3.id, disciplinaId, projetoId: projeto.id, numero: 1, pagina: 1, x: 0.1, y: 0.1, texto: "Falta pilar", severidade: "impeditivo", publicadoEm: new Date(), autorId: usuario.id },
    });
    await enviarParaAnaliseNoBanco({ revisaoId: r4.id, quem });
    check("D3-c: impeditivo bloqueia mesmo com pendências permitidas", /impeditivo/.test((await recusa(() => publicarNoBanco({ revisaoId: r4.id, quem, justificativa: "x" }))) ?? ""));

    // ── 6-B: aprovar a disciplina (e liberar pagamento) exige os documentos publicados ──
    const pendentes = await documentosPendentesDePublicacao(prisma, { disciplinaId });
    check("6-B: só o documento ainda em análise impede aprovar a disciplina", pendentes.length === 1 && pendentes[0].includes("tres"));

    // ── A7: violação de I5 provocada de propósito ──
    const r5 = await revisao(d3.id, 2);
    const indevido = await prisma.controleRevisao.create({
      data: { revisaoId: r5.id, tipo: "liberado_obra", escopos: [], motivo: "inserido à mão (teste)", aplicadoPorId: usuario.id },
    });
    const integ = await verificarIntegridadeCiclo();
    const depois = await prisma.controleRevisao.findUnique({ where: { id: indevido.id }, select: { removidoEm: true, motivoRemocao: true } });
    check("A7: detectou e revogou a liberação indevida (I5)", integ.corrigidas >= 1 && depois?.removidoEm != null && depois.motivoRemocao === MOTIVO_CORRECAO_INTEGRIDADE);
    check(
      "A7: a correção virou evento no histórico",
      (await prisma.documentoEvento.count({ where: { revisaoId: r5.id, tipo: "controle_removido", userId: null } })) === 1,
    );

    // ── Envio automático ao cliente e controle "Em revisão" ──
    const ponteirosDe = (documentoId: string) =>
      prisma.documentoDisciplina.findUnique({ where: { id: documentoId }, select: { revisaoCompartilhadaId: true, revisaoLiberadaObraId: true } });
    const publicada = async (documentoId: string, numero: number) => {
      const rv = await revisao(documentoId, numero, { validado: true });
      await enviarParaAnaliseNoBanco({ revisaoId: rv.id, quem });
      const pub = await publicarNoBanco({ revisaoId: rv.id, quem });
      return { rv, pub };
    };

    await prisma.configDocumentosProjeto.deleteMany({ where: { projetoId: projeto.id } });
    const dE = await documento("envio");
    const { rv: rE0, pub: pubE0 } = await publicada(dE.id, 1);
    const enviadoE0 = await prisma.controleRevisao.findFirst({ where: { revisaoId: rE0.id, tipo: "enviado_cliente", removidoEm: null }, select: { origem: true } });
    check("publicar R00 com o padrão envia ao cliente", pubE0.envioAoCliente === "automatico" && enviadoE0?.origem === "publicacao" && (await ponteirosDe(dE.id))?.revisaoCompartilhadaId === rE0.id);

    // Config criada só com os campos antigos (como as de antes da mudança) nasce com o envio automático ligado.
    const configAntiga = await prisma.configDocumentosProjeto.create({
      data: { projetoId: projeto.id, liberarObraAutomaticamente: false, permitirPublicarComPendencias: false, diasAlertaCompartilhado: 7 },
    });
    check("config antiga nasce com envio automático", configAntiga.enviarAoClienteAutomaticamente === true);

    await aplicarControleNoBanco({ revisaoId: rE0.id, tipo: "liberado_obra", quem, motivo: "Liberado pelo RT" });
    const corrida = await Promise.allSettled([
      aplicarControleNoBanco({ revisaoId: rE0.id, tipo: "em_revisao", quem, motivo: "Cliente pediu ajuste" }),
      aplicarControleNoBanco({ revisaoId: rE0.id, tipo: "em_revisao", quem, motivo: "Cliente pediu ajuste (2)" }),
    ]);
    const emRevisaoAtivas = await prisma.controleRevisao.count({ where: { revisaoId: rE0.id, tipo: "em_revisao", removidoEm: null } });
    check(
      "marcar em revisão: só uma ativa",
      emRevisaoAtivas === 1 && corrida.filter((x) => x.status === "fulfilled").length === 1 && corrida.filter((x) => x.status === "rejected").length === 1,
    );
    const pE = await ponteirosDe(dE.id);
    check("marca não tira a R00 do cliente nem da obra", pE?.revisaoCompartilhadaId === rE0.id && pE?.revisaoLiberadaObraId === rE0.id);

    // O link público mostra a marca, com o motivo, nas duas pastas do cliente (spec §Restrições).
    await prisma.linkPublicoArquivos.create({
      data: { projetoId: projeto.id, token: tokenLink, escopo: "disciplinas", disciplinaIds: [disciplinaId], porSituacao: true, criadoPorId: usuario.id },
    });
    const motivoMarca = (await prisma.controleRevisao.findFirstOrThrow({ where: { revisaoId: rE0.id, tipo: "em_revisao", removidoEm: null }, select: { motivo: true } })).motivo;
    const idsE0 = new Set(rE0.uploads.map((u) => u.id));
    const noLinkMarcado = (await arquivosNoLink()).filter((a) => idsE0.has(a.id));
    check(
      "link público: a R00 marcada aparece em Compartilhado e em Liberado para obra com o motivo",
      noLinkMarcado.some((a) => a.situacao === "compartilhado") &&
        noLinkMarcado.some((a) => a.situacao === "liberado_obra") &&
        noLinkMarcado.every((a) => a.emRevisao === motivoMarca),
    );

    const marcaE0 = await prisma.controleRevisao.findFirstOrThrow({ where: { revisaoId: rE0.id, tipo: "em_revisao", removidoEm: null }, select: { id: true } });
    check("cancelar revisão exige motivo", (await recusa(() => removerControleNoBanco({ controleId: marcaE0.id, quem, motivo: " " }))) === "Informe o motivo.");

    const { rv: rE1 } = await publicada(dE.id, 2);
    const marcaRemovida = await prisma.controleRevisao.findUnique({ where: { id: marcaE0.id }, select: { removidoEm: true, motivoRemocao: true } });
    check(
      "publicar R01 tira a marca da R00",
      (await estado(rE0.id)) === "arquivado" && marcaRemovida?.removidoEm != null && marcaRemovida.motivoRemocao === "Revisão R01 publicada" && (await ativos(rE1.id)).includes("enviado_cliente"),
    );
    const idsE1 = new Set(rE1.uploads.map((u) => u.id));
    const noLinkDepois = (await arquivosNoLink()).filter((a) => idsE0.has(a.id) || idsE1.has(a.id));
    check(
      "link público: publicada a R01, a marca some (o link mostra a R01, sem \"Em revisão\")",
      noLinkDepois.length > 0 && noLinkDepois.every((a) => idsE1.has(a.id) && a.emRevisao === null),
    );

    // Envio automático desligado = a herança de antes (a nova só vai ao cliente se a anterior estava lá).
    await config({ enviar: false });
    const dF = await documento("heranca");
    const { rv: rF0, pub: pubF0 } = await publicada(dF.id, 1);
    check("envio automático desligado: R00 publicada não vai ao cliente", pubF0.envioAoCliente === null && !(await ativos(rF0.id)).includes("enviado_cliente"));
    await aplicarControleNoBanco({ revisaoId: rF0.id, tipo: "enviado_cliente", quem, motivo: "Para aprovação do cliente" });
    await aplicarControleNoBanco({ revisaoId: rF0.id, tipo: "em_revisao", quem, motivo: "Cliente pediu ajuste" });
    const { rv: rF1, pub: pubF1 } = await publicada(dF.id, 2);
    check(
      "envio automático desligado = herança antiga",
      pubF1.envioAoCliente === "herdado" && (await ativos(rF1.id)).includes("enviado_cliente") && !(await ativos(rF0.id)).includes("em_revisao"),
    );
  } finally {
    await prisma.linkPublicoArquivos.deleteMany({ where: { token: tokenLink } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(ok ? "\nSmoke do ciclo documental: tudo certo." : "\nSmoke do ciclo documental: HOUVE FALHA.");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
