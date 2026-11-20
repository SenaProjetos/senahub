/**
 * Smoke do pedido de revisão do cliente (spec docs/superpowers/specs/2026-11-19-portal-pedido-revisao-design.md) contra
 * o banco de dev. As regras são puras e estão em `modules/portal/pedido-revisao/regras.test.ts`; aqui vai a ligação com
 * o banco: quem pode pedir (prancha nas Entregas, outro cliente), o aceite marcando "Em revisão" pelo serviço do ciclo,
 * as corridas (dois aceites, aceite × cancelamento), a recusa e a revisão substituída. No fim, o pedido no modelo 3D
 * (spec 2026-11-20-portal-visualizador-3d-design.md): marcações só em modelos do portal, aceite virando apontamentos 3D
 * da coordenação, "Em revisão" uma vez por revisão das Entregas, corridas e modelo que saiu das Entregas.
 *
 * Cria clientes + projetos + documentos + contas throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:pedido-revisao-cliente
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import {
  MOTIVO_ANEXO_SO_AUTOR,
  MOTIVO_MODELO_FORA,
  aceitarPedidoModeloNoBanco,
  aceitarPedidoNoBanco,
  criarPedidoModeloNoBanco,
  exigirEscopoDoPedidoModelo,
  anexoParaBaixar,
  avisarPedidoNovo,
  avisarResposta,
  caminhosDosAnexosDosUploads,
  removerArquivosDosAnexos,
  cancelarPedidoNoBanco,
  gravarAnexoNoBanco,
  motivoParaAnexar,
  criarPedidoNoBanco,
  recusarPedidoNoBanco,
} from "../src/modules/portal/pedido-revisao/service";
import {
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_RECUSA_SEM_RESPOSTA,
  MOTIVO_REVISAO_SUBSTITUIDA,
  MOTIVO_SEM_VALIDAR,
} from "../src/modules/portal/pedido-revisao/regras";
import { pedidosDoProjetoNoPortal } from "../src/modules/portal/pedido-revisao/queries";
import { MOTIVO_SEM_ESCALA } from "../src/modules/portal/pedido-revisao/conversao";
import { criarPendenciaNoTx } from "../src/modules/projetos/pendencias/criar-service";
import { existeArquivo, removerArquivo, salvarArquivo } from "../src/lib/storage";
import type { SessionUser } from "../src/lib/session";
import { refDocumento } from "../src/modules/coordenacao/modelo-ref";
import { criarApontamentoCoordenacaoNoTx } from "../src/modules/coordenacao/apontamento-service";
import { MAX_PEDIDOS_AGUARDANDO, MOTIVO_PRANCHA_RETIRADA } from "../src/modules/portal/pedido-revisao/regras";

async function erroDe(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function main() {
  const tag = `SMKPEDIDO_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: unknown) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
    if (!cond) ok = false;
  };

  const coord = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!coord) throw new Error("Banco de dev sem usuário ativo.");
  const quem = { id: coord.id, podeValidar: true };

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];
  const arquivosSmoke: string[] = [];
  const novoCliente = async (sufixo: string) => {
    const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}` } });
    clientes.push(c.id);
    return c;
  };
  const novoProjeto = async (clienteId: string, sufixo: string) => {
    const p = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: "particular",
          nome: `${tag}_${sufixo}`,
          clienteId,
          disciplinas: { create: [{ disciplinaTextoLegado: "Estrutural", ordem: 0 }] },
        },
        include: { disciplinas: true },
      });
    });
    projetos.push(p.id);
    return { ...p, disciplinaId: p.disciplinas[0].id };
  };
  const novaConta = async (clienteId: string, sufixo: string) => {
    const u = await prisma.user.create({
      data: { name: `Mariana ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId },
    });
    usuarios.push(u.id);
    const tipo = tipoTermoPorTipo("externo");
    await prisma.aceiteTermo.create({ data: { userId: u.id, tipo, versao: TERMOS[tipo].versao, conteudoHash: "0".repeat(64) } });
    return { id: u.id, tipo: "externo" as const, mustChangePassword: false };
  };
  /** Prancha (PDF validado) numa revisão. `ciclo` = chave do pacote A e revisão publicada; `compartilhar` = nas Entregas. */
  const prancha = async (disciplinaId: string, nome: string, o: { ciclo: boolean; compartilhar: boolean }) => {
    const doc = await prisma.documentoDisciplina.create({
      data: { disciplinaId, chave: `${o.ciclo ? "A" : "sem-local"}/${tag}-${nome}`, nomeArquivo: `${tag}-${nome}.pdf` },
    });
    const rev = await prisma.documentoRevisao.create({
      data: { documentoId: doc.id, numero: 1, createdById: coord.id, estado: o.ciclo ? "publicado" : "em_andamento" },
    });
    const up = await prisma.upload.create({
      data: {
        disciplinaId,
        documentoId: doc.id,
        revisaoId: rev.id,
        pacote: o.ciclo ? "A" : null,
        nomeArquivo: `${tag}-${nome}.pdf`,
        caminho: `smoke/${tag}-${nome}.pdf`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: coord.id,
        validado: true,
      },
    });
    if (o.compartilhar) {
      await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
      if (o.ciclo) {
        await prisma.controleRevisao.create({ data: { revisaoId: rev.id, tipo: "enviado_cliente", motivo: "smoke", aplicadoPorId: coord.id } });
      }
    }
    return { doc, rev, up };
  };

  try {
    const cliente = await novoCliente("cli");
    const outro = await novoCliente("outro");
    const p1 = await novoProjeto(cliente.id, "p1");
    await novoProjeto(outro.id, "p2");
    const conta = await novaConta(cliente.id, "cli");
    const colega = await novaConta(cliente.id, "colega");
    const alheia = await novaConta(outro.id, "outro");

    const a = await prancha(p1.disciplinaId, "a", { ciclo: true, compartilhar: true });
    const fora = await prancha(p1.disciplinaId, "fora", { ciclo: true, compartilhar: false });
    const semCiclo = await prancha(p1.disciplinaId, "semciclo", { ciclo: false, compartilhar: true });

    const pedir = (uploadId: string, autor = conta, comentario = "Mudar a porta da cozinha") =>
      criarPedidoNoBanco({ autor, projetoId: p1.id, uploadId, comentario });

    // ── quem pede ──
    const p = await pedir(a.up.id);
    const lido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p.id } });
    check(
      "cliente cria pedido em prancha das Entregas",
      lido?.status === "aguardando" && lido.revisaoId === a.rev.id && lido.documentoId === a.doc.id,
    );
    check("prancha fora das Entregas: recusa", (await erroDe(pedir(fora.up.id))) !== null);
    check("conta de outro cliente: recusa", (await erroDe(pedir(a.up.id, alheia))) !== null);
    check("comentário vazio: recusa", (await erroDe(pedir(a.up.id, conta, "   "))) !== null);
    check("pedido aguardando não aparece em pendencia", (await prisma.pendencia.count({ where: { documentoId: a.doc.id } })) === 0);

    // ── aceite ──
    check(
      "aceitar sem uploads:validar: recusa",
      (await erroDe(aceitarPedidoNoBanco({ id: p.id, quem: { id: coord.id, podeValidar: false }, resposta: null }))) === MOTIVO_SEM_VALIDAR,
    );
    const aceite = await aceitarPedidoNoBanco({ id: p.id, quem, resposta: "Vamos ajustar." });
    const marca = await prisma.controleRevisao.findFirst({ where: { revisaoId: a.rev.id, tipo: "em_revisao", removidoEm: null } });
    check(
      "aceite marca Em revisão com o comentário",
      aceite.emRevisao && marca?.motivo === "Pedido do cliente: Mudar a porta da cozinha" && marca.origem === "pedido_cliente",
      { aceite, marca: marca?.motivo },
    );
    check(
      "segundo aceite: já respondido",
      (await erroDe(aceitarPedidoNoBanco({ id: p.id, quem, resposta: null }))) === MOTIVO_JA_RESPONDIDO,
    );

    // Outro pedido na mesma revisão: aceita sem segunda marca.
    const p2 = await pedir(a.up.id, colega, "Trocar o piso");
    const aceite2 = await aceitarPedidoNoBanco({ id: p2.id, quem, resposta: null });
    const marcas = await prisma.controleRevisao.count({ where: { revisaoId: a.rev.id, tipo: "em_revisao", removidoEm: null } });
    check("segundo pedido na revisão: aceita sem outra marca", !aceite2.emRevisao && aceite2.jaEstavaEmRevisao && marcas === 1);

    // ── corrida: aceitar × cancelar ──
    const p3 = await pedir(a.up.id);
    const [r1, r2] = await Promise.allSettled([
      aceitarPedidoNoBanco({ id: p3.id, quem, resposta: null }),
      cancelarPedidoNoBanco({ id: p3.id, autor: colega }),
    ]);
    const final3 = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p3.id }, select: { status: true } });
    const venceu = [r1, r2].filter((r) => r.status === "fulfilled").length;
    check(
      "aceitar × cancelar ao mesmo tempo: um vence",
      venceu === 1 && (final3?.status === "aceito") === (r1.status === "fulfilled"),
      { r1: r1.status, r2: r2.status, final3 },
    );

    // ── cancelar: outro cliente não cancela ──
    const p4 = await pedir(a.up.id);
    check("conta de outro cliente não cancela", (await erroDe(cancelarPedidoNoBanco({ id: p4.id, autor: alheia }))) !== null);
    await cancelarPedidoNoBanco({ id: p4.id, autor: colega });
    check(
      "cancelado não aceita",
      (await erroDe(aceitarPedidoNoBanco({ id: p4.id, quem, resposta: null }))) === MOTIVO_JA_RESPONDIDO,
    );

    // ── recusa ──
    const p5 = await pedir(a.up.id);
    check(
      "recusar sem resposta: recusa",
      (await erroDe(recusarPedidoNoBanco({ id: p5.id, quem, resposta: "  " }))) === MOTIVO_RECUSA_SEM_RESPOSTA,
    );
    await recusarPedidoNoBanco({ id: p5.id, quem, resposta: "Já está conforme o contrato." });
    const r5 = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: p5.id } });
    check("recusa grava resposta", r5?.status === "recusado" && r5.resposta === "Já está conforme o contrato." && r5.respondidoPorId === coord.id);

    // ── revisão nova publicada entre o pedido e o aceite ──
    const b = await prancha(p1.disciplinaId, "b", { ciclo: true, compartilhar: true });
    const p6 = await pedir(b.up.id);
    await prisma.documentoRevisao.update({ where: { id: b.rev.id }, data: { estado: "arquivado" } });
    await prisma.documentoRevisao.create({ data: { documentoId: b.doc.id, numero: 2, createdById: coord.id, estado: "publicado" } });
    check(
      "revisão nova publicada: aceite recusado",
      (await erroDe(aceitarPedidoNoBanco({ id: p6.id, quem, resposta: null }))) === MOTIVO_REVISAO_SUBSTITUIDA,
    );
    check("revisão nova publicada: recusa possível", (await erroDe(recusarPedidoNoBanco({ id: p6.id, quem, resposta: "Confira a R02." }))) === null);

    // ── fora do ciclo ──
    const p7 = await pedir(semCiclo.up.id);
    const aceite7 = await aceitarPedidoNoBanco({ id: p7.id, quem, resposta: null });
    const marcasSemCiclo = await prisma.controleRevisao.count({ where: { revisaoId: semCiclo.rev.id } });
    check("documento fora do ciclo: aceite sem marca", !aceite7.emRevisao && marcasSemCiclo === 0);

    // ── fora do ciclo, a pasta do cliente passou a mostrar outra revisão ──
    const d = await prancha(p1.disciplinaId, "d", { ciclo: false, compartilhar: true });
    const pd = await pedir(d.up.id);
    const r2d = await prisma.documentoRevisao.create({ data: { documentoId: d.doc.id, numero: 2, createdById: coord.id } });
    await prisma.documentoDisciplina.update({ where: { id: d.doc.id }, data: { revisaoCompartilhadaId: r2d.id } });
    check(
      "fora do ciclo, revisão que saiu da pasta do cliente: aceite recusado e portal mostra substituída",
      (await erroDe(aceitarPedidoNoBanco({ id: pd.id, quem, resposta: null }))) === MOTIVO_REVISAO_SUBSTITUIDA &&
        (await pedidosDoProjetoNoPortal(p1.id, cliente.id)).find((x) => x.id === pd.id)?.indisponivel === "substituida",
    );
    await recusarPedidoNoBanco({ id: pd.id, quem, resposta: "Confira a revisão nova." });

    // ── outras pranchas que não aceitam pedido ──
    const p1b = await novoProjeto(cliente.id, "p1b");
    const deOutroProjeto = await prancha(p1b.disciplinaId, "outroprojeto", { ciclo: true, compartilhar: true });
    check(
      "upload de outro projeto do mesmo cliente com o projetoId deste: recusa",
      (await erroDe(criarPedidoNoBanco({ autor: conta, projetoId: p1.id, uploadId: deOutroProjeto.up.id, comentario: "x" }))) !== null,
    );
    const bloqueada = await prancha(p1.disciplinaId, "bloq", { ciclo: true, compartilhar: true });
    await prisma.controleRevisao.create({
      data: { revisaoId: bloqueada.rev.id, tipo: "bloqueio", escopos: ["download"], motivo: "smoke", aplicadoPorId: coord.id },
    });
    check("prancha com download bloqueado: recusa", (await erroDe(pedir(bloqueada.up.id))) !== null);
    const dwg = await prisma.upload.create({
      data: {
        disciplinaId: p1.disciplinaId,
        documentoId: a.doc.id,
        revisaoId: a.rev.id,
        pacote: "A",
        nomeArquivo: `${tag}-a.dwg`,
        caminho: `smoke/${tag}-a.dwg`,
        tamanho: 10,
        hashSha256: "0".repeat(64),
        autorId: coord.id,
        validado: true,
      },
    });
    check("arquivo que não é PDF: recusa", (await erroDe(pedir(dwg.id))) !== null);

    // ── dois aceites ao mesmo tempo, pedidos diferentes da mesma revisão: uma marca só ──
    const e = await prancha(p1.disciplinaId, "e", { ciclo: true, compartilhar: true });
    const pe1 = await pedir(e.up.id);
    const pe2 = await pedir(e.up.id, colega);
    const duplo = await Promise.allSettled([
      aceitarPedidoNoBanco({ id: pe1.id, quem, resposta: null }),
      aceitarPedidoNoBanco({ id: pe2.id, quem, resposta: null }),
    ]);
    const marcasE = await prisma.controleRevisao.count({ where: { revisaoId: e.rev.id, tipo: "em_revisao", removidoEm: null } });
    check(
      "dois aceites simultâneos na mesma revisão: os dois aceitos, uma marca Em revisão",
      duplo.every((r) => r.status === "fulfilled") && marcasE === 1,
      { duplo: duplo.map((r) => r.status), marcasE },
    );

    // ── leitura do portal ──
    const doCliente = await pedidosDoProjetoNoPortal(p1.id, cliente.id);
    check(
      "portal: lista os pedidos do projeto sem quem respondeu",
      doCliente.length === 10 && doCliente.every((x) => !("respondidoPor" in x) && !("respondidoPorId" in x)),
      doCliente.length,
    );
    check("portal: outro cliente não vê os pedidos", (await pedidosDoProjetoNoPortal(p1.id, outro.id)).length === 0);

    // ── marcações: viram rascunhos de apontamento no aceite ──
    const c = await prancha(p1.disciplinaId, "c", { ciclo: true, compartilhar: true });
    await prisma.calibracaoPrancha.create({ data: { documentoId: c.doc.id, pagina: 1, modo: "escala", escalaDenominador: 50, mmPorPonto: 2, autorId: coord.id } });
    const ja = await prisma.$transaction((tx) =>
      criarPendenciaNoTx(tx, {
        upload: { id: c.up.id, documentoId: c.doc.id, disciplinaId: p1.disciplinaId, projetoId: p1.id },
        autorId: coord.id,
        dados: { pagina: 1, x: 0.5, y: 0.5, texto: "da equipe", marcacao: null, medida: null },
      }),
    );
    const paginaPt = { w: 1000, h: 500 };
    const marcacoes = [
      { pagina: 1, x: 0.1, y: 0.2, texto: "Porta aqui", marcacao: null },
      { pagina: 1, x: 0.3, y: 0.3, texto: "Área da varanda", marcacao: { tipo: "nuvem" as const, pontos: [{ dx: 0.1, dy: 0.05 }] } },
      {
        pagina: 1,
        x: 0.4,
        y: 0.4,
        texto: "Rabisco",
        marcacao: { tipo: "livre" as const, pontos: [], tracos: [[{ dx: 0, dy: 0 }, { dx: 0.05, dy: 0.02 }]], estilos: [{ cor: "azul" as const, espessura: 4 }] },
      },
      { pagina: 1, x: 0.6, y: 0.1, texto: "Cota errada", marcacao: { tipo: "medida" as const, pontos: [{ dx: 0.1, dy: 0 }] }, paginaPt },
    ];
    check(
      "cota sem calibração recusada (nada gravado)",
      (await erroDe(criarPedidoNoBanco({ autor: conta, projetoId: p1.id, uploadId: a.up.id, comentario: "x", marcacoes: [marcacoes[3]] }))) ===
        MOTIVO_SEM_ESCALA,
    );
    const pm = await criarPedidoNoBanco({ autor: conta, projetoId: p1.id, uploadId: c.up.id, comentario: "Várias coisas", marcacoes });
    const gravadas = await prisma.marcacaoPedidoCliente.findMany({ where: { pedidoId: pm.id }, orderBy: { ordem: "asc" } });
    check("cota recalculada no servidor pela calibração", Math.round(gravadas[3]?.medidaMm ?? 0) === 200 && gravadas[3]?.medidaFator === 2, gravadas[3]);
    check("pedido com marcações aguardando não cria apontamento", (await prisma.pendencia.count({ where: { documentoId: c.doc.id } })) === 1);
    const aceiteM = await aceitarPedidoNoBanco({ id: pm.id, quem, resposta: null });
    const rascunhos = await prisma.pendencia.findMany({ where: { documentoId: c.doc.id, id: { not: ja.id } }, orderBy: { numero: "asc" } });
    check(
      "aceite cria rascunhos não publicados da coordenação com número seguindo o documento",
      aceiteM.rascunhos === 4 &&
        rascunhos.length === 4 &&
        rascunhos.every((r) => r.publicadoEm === null && r.autorId === coord.id && r.uploadId === c.up.id && r.status === "aberta") &&
        JSON.stringify(rascunhos.map((r) => r.numero)) === "[2,3,4,5]",
      rascunhos.map((r) => [r.numero, r.publicadoEm, r.autorId === coord.id]),
    );
    check(
      "rascunho no mesmo ponto e com a mesma geometria",
      rascunhos.every((r, i) => r.x === gravadas[i].x && r.y === gravadas[i].y && r.pagina === gravadas[i].pagina) &&
        rascunhos[0].marcacaoTipo === null &&
        rascunhos[1].marcacaoTipo === "nuvem" &&
        JSON.stringify(rascunhos[1].marcacaoGeo) === JSON.stringify(gravadas[1].marcacaoGeo) &&
        JSON.stringify(rascunhos[2].marcacaoGeo) === JSON.stringify(gravadas[2].marcacaoGeo) &&
        rascunhos[3].medidaMm === gravadas[3].medidaMm &&
        rascunhos[1].texto === "Cliente (Mariana): Área da varanda",
    );
    const ligadas = await prisma.marcacaoPedidoCliente.findMany({ where: { pedidoId: pm.id }, orderBy: { ordem: "asc" }, select: { pendenciaId: true } });
    check("pendenciaId gravado", JSON.stringify(ligadas.map((l) => l.pendenciaId)) === JSON.stringify(rascunhos.map((r) => r.id)));
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        prisma.$transaction((tx) =>
          criarPendenciaNoTx(tx, {
            upload: { id: c.up.id, documentoId: c.doc.id, disciplinaId: p1.disciplinaId, projetoId: p1.id },
            autorId: coord.id,
            dados: { pagina: 1, x: 0.1 * n, y: 0.1, texto: `paralelo ${n}`, marcacao: null, medida: null },
          }),
        ),
      ),
    );
    const numeros = (await prisma.pendencia.findMany({ where: { documentoId: c.doc.id }, select: { numero: true } })).map((p) => p.numero);
    check("apontamentos criados ao mesmo tempo no mesmo documento: números sem repetir", new Set(numeros).size === numeros.length, numeros);

    // ── avisos (sem disparar nada: notificador e e-mail falsos) ──
    const sinos: { ids: string[]; titulo: string; href?: string; categoria?: string }[] = [];
    const notificarMuitosFalso = async (ids: string[], n: { titulo: string; href?: string }, o?: { categoria?: string }) => {
      sinos.push({ ids, titulo: n.titulo, href: n.href, categoria: o?.categoria });
    };
    const semCoord = await avisarPedidoNovo(pm.id, notificarMuitosFalso);
    const gestoresIds = sinos[0]?.ids ?? [];
    await prisma.projetoMembro.create({ data: { projetoId: p1.id, userId: coord.id, papel: "coordenador" } });
    sinos.length = 0;
    const comCoord = await avisarPedidoNovo(pm.id, notificarMuitosFalso);
    check(
      "pedido novo avisa a coordenação (ou gestores sem coordenador)",
      semCoord.avisados > 0 &&
        gestoresIds.length > 0 &&
        comCoord.avisados === 1 &&
        JSON.stringify(sinos[0]?.ids) === JSON.stringify([coord.id]) &&
        sinos[0]?.categoria === "pedido_revisao_cliente" &&
        sinos[0]?.href === `/arquivos/pedidos-cliente/${pm.id}`,
      { semCoord, comCoord, sinos },
    );
    const sinoCliente: { id: string; titulo: string }[] = [];
    const emails: { to: string; slug: string; vars: Record<string, string> }[] = [];
    const resp = await avisarResposta(p5.id, {
      notificar: async (id: string, n: { titulo: string }) => {
        sinoCliente.push({ id, titulo: n.titulo });
      },
      enviarEmail: async (to: string, slug: string, vars: Record<string, string>) => {
        emails.push({ to, slug, vars });
        return true;
      },
    });
    check(
      "resposta avisa quem pediu (sino e e-mail)",
      resp.sino &&
        resp.email &&
        sinoCliente[0]?.id === conta.id &&
        sinoCliente[0]?.titulo === "Pedido de revisão recusado" &&
        emails[0]?.slug === "pedido-revisao-respondido" &&
        emails[0]?.vars.situacao === "recusado" &&
        emails[0]?.vars.resposta.includes("conforme o contrato"),
      { resp, sinoCliente, emails },
    );
    const semSmtp = await avisarResposta(p5.id, { notificar: async () => {}, enviarEmail: null });
    check("sem SMTP: só o sino", semSmtp.sino && !semSmtp.email);

    // ── quem não pode abrir a fila não recebe o sino ──
    const semPerm = await prisma.user.create({ data: { name: `${tag} sem permissão`, email: `${tag.toLowerCase()}_semperm@smoke.local`, tipo: "interno" } });
    usuarios.push(semPerm.id);
    await prisma.projetoMembro.create({ data: { projetoId: p1.id, userId: semPerm.id, papel: "coordenador" } });
    sinos.length = 0;
    await avisarPedidoNovo(pm.id, notificarMuitosFalso);
    check(
      "coordenador sem arquivos:alterar_status não recebe o aviso do pedido",
      JSON.stringify(sinos[0]?.ids) === JSON.stringify([coord.id]),
      sinos[0]?.ids,
    );

    // ── prancha na lixeira: "retirada", não "revisão nova" ──
    const g = await prancha(p1.disciplinaId, "g", { ciclo: true, compartilhar: true });
    const pg = await pedir(g.up.id);
    await prisma.upload.update({ where: { id: g.up.id }, data: { excluidoEm: new Date() } });
    check(
      "prancha na lixeira: aceite recusado com a frase de retirada e portal mostra retirada",
      (await erroDe(aceitarPedidoNoBanco({ id: pg.id, quem, resposta: null }))) === MOTIVO_PRANCHA_RETIRADA &&
        (await pedidosDoProjetoNoPortal(p1.id, cliente.id)).find((x) => x.id === pg.id)?.indisponivel === "retirada",
    );

    // ── limite de pedidos aguardando por conta no projeto ──
    const muito = await novaConta(cliente.id, "muito");
    const h = await prancha(p1.disciplinaId, "h", { ciclo: true, compartilhar: true });
    for (let i = 0; i < MAX_PEDIDOS_AGUARDANDO; i++) await pedir(h.up.id, muito, `pedido ${i}`);
    check(`conta com ${MAX_PEDIDOS_AGUARDANDO} pedidos aguardando: o próximo é recusado`, (await erroDe(pedir(h.up.id, muito))) !== null);
    const umDeles = await prisma.pedidoRevisaoCliente.findFirstOrThrow({ where: { autorId: muito.id }, select: { id: true } });
    await cancelarPedidoNoBanco({ id: umDeles.id, autor: muito });
    check("cancelando um, volta a poder pedir", (await erroDe(pedir(h.up.id, muito))) === null);

    // ── purga da lixeira: os arquivos dos anexos saem do disco junto ──
    const pp = await pedir(h.up.id);
    const caminhoAnexo = `portal/pedidos/${pp.id}/${tag}-purga.pdf`;
    await salvarArquivo(caminhoAnexo, Buffer.from("%PDF-1.4 smoke"));
    await gravarAnexoNoBanco({ pedidoId: pp.id, userId: conta.id, nome: "purga.pdf", caminho: caminhoAnexo, tamanho: 14, mime: "application/pdf" });
    const caminhos = await caminhosDosAnexosDosUploads([h.up.id]);
    await prisma.upload.delete({ where: { id: h.up.id } });
    await removerArquivosDosAnexos(caminhos);
    check(
      "purga do PDF apaga os pedidos e os arquivos dos anexos",
      caminhos.includes(caminhoAnexo) && !(await existeArquivo(caminhoAnexo)) && (await prisma.pedidoRevisaoCliente.count({ where: { id: pp.id } })) === 0,
    );

    // ── o banco recusa status fora da máquina de estados ──
    check(
      "status fora da máquina de estados é recusado pelo banco",
      (await erroDe(prisma.pedidoRevisaoCliente.update({ where: { id: p5.id }, data: { status: "aprovado" } }))) !== null,
    );

    // ── anexos (o arquivo em disco é da rota; aqui só o registro) ──
    const p8 = await pedir(a.up.id);
    const anexo = (n: number, autorId = conta.id, pedidoId = p8.id) =>
      gravarAnexoNoBanco({ pedidoId, userId: autorId, nome: `f${n}.pdf`, caminho: `smoke/${tag}-f${n}.pdf`, tamanho: 1, mime: "application/pdf" });
    check(
      "anexo: só o autor",
      (await motivoParaAnexar({ pedidoId: p8.id, userId: colega.id, nome: "a.pdf" })) === MOTIVO_ANEXO_SO_AUTOR &&
        (await erroDe(anexo(0, colega.id))) === MOTIVO_ANEXO_SO_AUTOR,
    );
    check("anexo: extensão fora da lista recusa", (await motivoParaAnexar({ pedidoId: p8.id, userId: conta.id, nome: "x.exe" })) !== null);
    const cinco = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((n) => anexo(n)));
    const gravados = await prisma.anexoPedidoCliente.count({ where: { pedidoId: p8.id } });
    check(
      "anexo: seis ao mesmo tempo, só cinco entram",
      gravados === 5 && cinco.filter((r) => r.status === "rejected").length === 1,
      { gravados },
    );
    const algum = await prisma.anexoPedidoCliente.findFirstOrThrow({ where: { pedidoId: p8.id }, select: { id: true } });
    const nunca = async () => false;
    check("anexo: conta de outro cliente não baixa", (await anexoParaBaixar(alheia, algum.id, nunca)) === null);
    check("anexo: outra conta do mesmo cliente baixa", (await anexoParaBaixar(colega, algum.id, nunca)) !== null);
    const interno = { id: coord.id, tipo: "interno" as const, mustChangePassword: false };
    check(
      "anexo: equipe só com o gate da coordenação",
      (await anexoParaBaixar(interno, algum.id, nunca)) === null && (await anexoParaBaixar(interno, algum.id, async () => true)) !== null,
    );
    await cancelarPedidoNoBanco({ id: p8.id, autor: conta });
    check("anexo: pedido cancelado não recebe anexo", (await erroDe(anexo(9))) === MOTIVO_ANEXO_SO_AUTOR);

    {
      // ═════════════════════════════════════════════════════════════
      // Pedido no modelo 3D (spec 2026-11-20-portal-visualizador-3d-design.md, etapa 3)
      // ═════════════════════════════════════════════════════════════
      const p3d = await novoProjeto(cliente.id, "p3d");
      /** IFC validado numa revisão publicada do pacote A; `compartilhar` = nas Entregas. */
      const ifc = async (nome: string, o: { compartilhar: boolean; converter: boolean }) => {
        const doc = await prisma.documentoDisciplina.create({
          data: { disciplinaId: p3d.disciplinaId, chave: `A/${tag}-${nome}`, nomeArquivo: `${tag}-${nome}.ifc` },
        });
        const rev = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 1, createdById: coord.id, estado: "publicado" } });
        const up = await prisma.upload.create({
          data: {
            disciplinaId: p3d.disciplinaId,
            documentoId: doc.id,
            revisaoId: rev.id,
            pacote: "A",
            nomeArquivo: `${tag}-${nome}.ifc`,
            caminho: `smoke/${tag}-${nome}.ifc`,
            tamanho: 10,
            hashSha256: "0".repeat(64),
            autorId: coord.id,
            validado: true,
          },
        });
        if (o.compartilhar) {
          await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
          await prisma.controleRevisao.create({ data: { revisaoId: rev.id, tipo: "enviado_cliente", motivo: "smoke", aplicadoPorId: coord.id } });
        }
        if (o.converter) {
          await prisma.conversaoModelo.create({ data: { uploadId: up.id, status: "concluido", caminhoFrag: `smoke/${tag}-${nome}.frag`, concluidoEm: new Date() } });
        }
        return { doc, rev, up };
      };
      /** Documento do cliente (recebido) ou do Geral (interno) com uma versão IFC convertida. */
      const recebido = async (origem: "recebido_cliente" | "interno", nome: string) => {
        const d = await prisma.documento.create({
          data: {
            clienteId: cliente.id,
            projetoId: p3d.id,
            origem,
            nome: `${tag}-${nome}`,
            exibirEmRecebidos: origem === "interno",
            versoes: {
              create: [
                { numero: 1, caminho: `smoke/${tag}-${nome}.ifc`, nomeArquivo: `${nome}.ifc`, mime: "application/octet-stream", tamanho: 10, hashSha256: "0".repeat(64) },
              ],
            },
          },
          include: { versoes: true },
        });
        await prisma.conversaoModelo.create({
          data: { documentoVersaoId: d.versoes[0].id, status: "concluido", caminhoFrag: `smoke/${tag}-${nome}.frag`, concluidoEm: new Date() },
        });
        return { doc: d, modeloId: refDocumento(d.versoes[0].id) };
      };

      // U nas Entregas + R1 realinhado dele (convertido: é o que o portal serve); U2 outro IFC nas Entregas; X fora das
      // Entregas; S nas Entregas sem conversão; recebido do cliente e um IFC interno do Geral.
      const u = await ifc("estrutura", { compartilhar: true, converter: true });
      const r1 = await prisma.upload.create({
        data: {
          disciplinaId: p3d.disciplinaId,
          nomeArquivo: `${tag}-estrutura.ifc`,
          caminho: `smoke/${tag}-estrutura-r1.ifc`,
          tamanho: 10,
          hashSha256: "0".repeat(64),
          autorId: coord.id,
          versao: 2,
          origem: "ferramenta",
          realinhadoDeId: u.up.id,
        },
      });
      await prisma.conversaoModelo.create({ data: { uploadId: r1.id, status: "concluido", caminhoFrag: `smoke/${tag}-r1.frag`, concluidoEm: new Date() } });
      const u2 = await ifc("fundacao", { compartilhar: true, converter: true });
      const x = await ifc("fora", { compartilhar: false, converter: true });
      const semConv = await ifc("semconv", { compartilhar: true, converter: false });
      const base = await recebido("recebido_cliente", "base");
      const internoGeral = await recebido("interno", "interno");

      const camera = { position: [10, 10, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
      const marca3d = (modeloId: string, texto: string, guids = ["2O2Fr$t4X7Zf8NOew3FLOH"]) => ({
        modeloId,
        guids,
        ponto: [1, 2, 3] as [number, number, number],
        camera,
        texto,
      });
      // JSONB reordena as chaves: compara campo a campo.
      const mesmaCamera = (v: unknown) => {
        const c = v as { position?: unknown; target?: unknown } | null;
        return JSON.stringify(c?.position) === JSON.stringify(camera.position) && JSON.stringify(c?.target) === JSON.stringify(camera.target);
      };
      const pedirModelo = (marcacoes: ReturnType<typeof marca3d>[], autor = conta, comentario = "Revisar o modelo") =>
        criarPedidoModeloNoBanco({ autor, projetoId: p3d.id, comentario, marcacoes });

      // ── criar ──
      const pm3 = await pedirModelo([
        marca3d(r1.id, "Pilar fora do eixo"),
        marca3d(r1.id, "Viga baixa\nno corredor"),
        marca3d(u2.up.id, "Sapata maior"),
        marca3d(base.modeloId, "Parede da sala"),
      ]);
      const gravadas3d = await prisma.marcacaoModeloCliente.findMany({ where: { pedidoId: pm3.id }, orderBy: { ordem: "asc" } });
      const lido3d = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: pm3.id } });
      const soComentario = await pedirModelo([], conta, "Só um comentário geral");
      check(
        "pedido de modelo cria com marcações nos modelos do portal",
        lido3d?.tipo === "modelo" &&
          lido3d.status === "aguardando" &&
          lido3d.uploadId === null &&
          lido3d.revisaoId === null &&
          lido3d.documentoId === null &&
          JSON.stringify(pm3.marcacaoIds) === JSON.stringify(gravadas3d.map((m) => m.id)) &&
          gravadas3d[0].modeloId === r1.id &&
          gravadas3d[0].origemUploadId === u.up.id &&
          gravadas3d[2].origemUploadId === u2.up.id &&
          gravadas3d[3].modeloId === base.modeloId &&
          gravadas3d[3].origemUploadId === null &&
          gravadas3d[3].documentoRecebidoId === base.doc.id &&
          mesmaCamera(gravadas3d[0].camera) &&
          JSON.stringify(gravadas3d[0].ponto) === "[1,2,3]" &&
          (await prisma.pedidoRevisaoCliente.findUnique({ where: { id: soComentario.id } }))?.tipo === "modelo",
        { lido3d, gravadas3d },
      );

      // ── recusas na criação ──
      const recusasModelo = [
        await erroDe(pedirModelo([marca3d(u.up.id, "a origem, não a servida")])),
        await erroDe(pedirModelo([marca3d(x.up.id, "fora das Entregas")])),
        await erroDe(pedirModelo([marca3d(semConv.up.id, "sem conversão")])),
        await erroDe(pedirModelo([marca3d(internoGeral.modeloId, "interno do Geral")])),
        await erroDe(pedirModelo([marca3d(r1.id, "outro cliente")], alheia)),
      ];
      check(
        "modelo que não está no portal: recusa",
        recusasModelo.every((e) => e === MOTIVO_MODELO_FORA) &&
          (await erroDe(pedirModelo([marca3d(r1.id, "   ")]))) !== null &&
          (await erroDe(pedirModelo([marca3d(r1.id, "x")], conta, "  "))) !== null,
        recusasModelo,
      );

      // ── leitura e avisos sem "undefined" ──
      const noPortal = (await pedidosDoProjetoNoPortal(p3d.id, cliente.id)).find((v) => v.id === pm3.id);
      const sinos3d: { corpo: string }[] = [];
      await avisarPedidoNovo(pm3.id, async (_ids, n) => {
        sinos3d.push({ corpo: n.corpo });
      });
      check(
        "pedido de modelo no portal e no aviso: Modelo 3D, sem prancha",
        noPortal?.tipo === "modelo" &&
          noPortal.prancha === "Modelo 3D" &&
          noPortal.uploadId === null &&
          noPortal.revisao === "" &&
          noPortal.marcacoes === 4 &&
          noPortal.indisponivel === null &&
          (sinos3d[0]?.corpo ?? "").includes("Modelo 3D") &&
          !(sinos3d[0]?.corpo ?? "").includes("undefined"),
        { noPortal, sinos3d },
      );

      // ── muralha da coordenação ──
      const sessao = (id: string, superUsuario: boolean) =>
        ({ id, name: "smoke", email: "smoke@smoke.local", ativo: true, mustChangePassword: false, ehSocio: false, perfilId: null, perfilChave: null, escopoGlobalPerfil: false, superUsuario, tipo: "interno" }) as unknown as SessionUser;
      const semPerfil = await prisma.user.create({ data: { name: `${tag} sem perfil`, email: `${tag.toLowerCase()}_semperfil@smoke.local`, tipo: "interno" } });
      usuarios.push(semPerfil.id);
      check(
        "muralha do pedido de modelo: quem coordena passa, sem permissão não",
        (await erroDe(exigirEscopoDoPedidoModelo(sessao(coord.id, true), pm3.id))) === null &&
          (await erroDe(exigirEscopoDoPedidoModelo(sessao(semPerfil.id, false), pm3.id))) !== null,
      );

      // ── aceite ──
      // A imagem da vista: a 1ª marcação com o PNG no disco, a 2ª com um caminho que sumiu (fica sem imagem).
      const pngMarca = `portal/pedidos/${pm3.id}/marcacoes/${gravadas3d[0].id}.png`;
      await salvarArquivo(pngMarca, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
      arquivosSmoke.push(pngMarca);
      await prisma.marcacaoModeloCliente.update({ where: { id: gravadas3d[0].id }, data: { snapshotPath: pngMarca } });
      await prisma.marcacaoModeloCliente.update({ where: { id: gravadas3d[1].id }, data: { snapshotPath: `portal/pedidos/${pm3.id}/sumiu.png` } });
      // Um apontamento da equipe já existe no projeto: os do cliente seguem a numeração.
      await prisma.$transaction((tx) =>
        criarApontamentoCoordenacaoNoTx(tx, {
          projetoId: p3d.id,
          disciplinaId: p3d.disciplinaId,
          uploadId: r1.id,
          titulo: "da equipe",
          texto: "da equipe",
          guids: [],
          camera,
          autorId: coord.id,
        }),
      );
      const aceite3d = await aceitarPedidoModeloNoBanco({ id: pm3.id, quem: { id: coord.id }, resposta: "Vamos ver." });
      const apontamentos3d = await prisma.apontamentoCoordenacao.findMany({
        where: { projetoId: p3d.id, numero: { gt: 1 } },
        orderBy: { numero: "asc" },
      });
      const ligadas3d = await prisma.marcacaoModeloCliente.findMany({ where: { pedidoId: pm3.id }, orderBy: { ordem: "asc" } });
      const pngApontamento = `coordenacao/apontamentos/${p3d.id}/${apontamentos3d[0]?.id}.png`;
      arquivosSmoke.push(pngApontamento);
      check(
        "aceite cria apontamentos 3D sem tarefa, numerados no projeto, no modelo que o cliente viu, autor = quem aceitou",
        aceite3d.apontamentos === 4 &&
          apontamentos3d.length === 4 &&
          JSON.stringify(apontamentos3d.map((a) => a.numero)) === "[2,3,4,5]" &&
          apontamentos3d.every((a) => a.autorId === coord.id && a.status === "aberta" && a.tarefaId === null && a.tarefaItemId === null) &&
          JSON.stringify(apontamentos3d.map((a) => a.uploadId)) === JSON.stringify([r1.id, r1.id, u2.up.id, base.modeloId]) &&
          JSON.stringify(apontamentos3d.map((a) => a.disciplinaId)) === JSON.stringify([p3d.disciplinaId, p3d.disciplinaId, p3d.disciplinaId, null]) &&
          apontamentos3d[1].titulo === "Viga baixa no corredor" &&
          apontamentos3d[0].texto === "Cliente (Mariana): Pilar fora do eixo" &&
          mesmaCamera(apontamentos3d[0].camera) &&
          JSON.stringify(apontamentos3d[0].guids) === JSON.stringify(["2O2Fr$t4X7Zf8NOew3FLOH"]) &&
          JSON.stringify(ligadas3d.map((m) => m.apontamentoId)) === JSON.stringify(apontamentos3d.map((a) => a.id)) &&
          (await prisma.pedidoRevisaoCliente.findUnique({ where: { id: pm3.id } }))?.status === "aceito",
        { aceite3d, apontamentos3d: apontamentos3d.map((a) => [a.numero, a.uploadId, a.disciplinaId, a.titulo, a.autorId === coord.id]) },
      );
      check(
        "imagem da marcação copiada para o apontamento (a do pedido fica); a que sumiu deixa o apontamento sem imagem",
        apontamentos3d[0]?.snapshotPath === pngApontamento &&
          (await existeArquivo(pngApontamento)) &&
          (await existeArquivo(pngMarca)) &&
          apontamentos3d[1]?.snapshotPath === null &&
          apontamentos3d[3]?.snapshotPath === null,
        apontamentos3d.map((a) => a.snapshotPath),
      );

      const marcasEmRevisao = async (revisaoId: string) =>
        prisma.controleRevisao.count({ where: { revisaoId, tipo: "em_revisao", removidoEm: null } });
      const pm3b = await pedirModelo([marca3d(r1.id, "Mais uma no pilar")], colega);
      const aceite3db = await aceitarPedidoModeloNoBanco({ id: pm3b.id, quem: { id: coord.id }, resposta: null });
      const marcaU = await prisma.controleRevisao.findFirst({ where: { revisaoId: u.rev.id, tipo: "em_revisao", removidoEm: null } });
      check(
        "Em revisão uma vez por revisão das Entregas, nenhuma no recebido",
        aceite3d.emRevisao === 2 &&
          aceite3db.emRevisao === 0 &&
          (await marcasEmRevisao(u.rev.id)) === 1 &&
          (await marcasEmRevisao(u2.rev.id)) === 1 &&
          marcaU?.motivo === "Pedido do cliente: Revisar o modelo" &&
          marcaU.origem === "pedido_cliente" &&
          (await prisma.controleRevisao.count({ where: { revisao: { documento: { disciplina: { projetoId: p3d.id } } }, tipo: "em_revisao" } })) === 2,
        { aceite3d, aceite3db },
      );
      check(
        "pedido de modelo só com comentário: aceite sem apontamento",
        (await aceitarPedidoModeloNoBanco({ id: soComentario.id, quem: { id: coord.id }, resposta: null })).apontamentos === 0,
      );

      // ── corridas ──
      const contarApontamentos = () => prisma.apontamentoCoordenacao.count({ where: { projetoId: p3d.id } });
      const antesCorrida = await contarApontamentos();
      const pc = await pedirModelo([marca3d(u2.up.id, "corrida aceitar × cancelar")]);
      const corrida1 = await Promise.allSettled([
        aceitarPedidoModeloNoBanco({ id: pc.id, quem: { id: coord.id }, resposta: null }),
        cancelarPedidoNoBanco({ id: pc.id, autor: colega }),
      ]);
      const finalPc = await prisma.pedidoRevisaoCliente.findUnique({ where: { id: pc.id }, select: { status: true } });
      const depoisCorrida1 = await contarApontamentos();
      const pd2 = await pedirModelo([marca3d(u2.up.id, "dois aceites"), marca3d(base.modeloId, "dois aceites no recebido")]);
      const corrida2 = await Promise.allSettled([
        aceitarPedidoModeloNoBanco({ id: pd2.id, quem: { id: coord.id }, resposta: null }),
        aceitarPedidoModeloNoBanco({ id: pd2.id, quem: { id: coord.id }, resposta: null }),
      ]);
      const depoisCorrida2 = await contarApontamentos();
      const aceitouPc = corrida1[0].status === "fulfilled";
      check(
        "aceitar × cancelar e dois aceites: um vence, sem apontamento órfão",
        corrida1.filter((r) => r.status === "fulfilled").length === 1 &&
          (finalPc?.status === "aceito") === aceitouPc &&
          depoisCorrida1 - antesCorrida === (aceitouPc ? 1 : 0) &&
          corrida2.filter((r) => r.status === "fulfilled").length === 1 &&
          depoisCorrida2 - depoisCorrida1 === 2 &&
          new Set((await prisma.apontamentoCoordenacao.findMany({ where: { projetoId: p3d.id }, select: { numero: true } })).map((a) => a.numero)).size ===
            depoisCorrida2,
        { corrida1: corrida1.map((r) => r.status), finalPc, corrida2: corrida2.map((r) => r.status), antesCorrida, depoisCorrida1, depoisCorrida2 },
      );

      // ── o modelo saiu das Entregas / o recebido foi excluído ──
      const u3 = await ifc("lixeira", { compartilhar: true, converter: true });
      const u4 = await ifc("revnova", { compartilhar: true, converter: true });
      const base2 = await recebido("recebido_cliente", "base2");
      const pRet = await pedirModelo([marca3d(u3.up.id, "vai para a lixeira")]);
      const pSub = await pedirModelo([marca3d(u4.up.id, "ganha revisão nova"), marca3d(u2.up.id, "segue nas Entregas")]);
      const pDoc = await pedirModelo([marca3d(base2.modeloId, "o cliente exclui o documento")]);
      await prisma.upload.update({ where: { id: u3.up.id }, data: { excluidoEm: new Date() } });
      await prisma.documentoRevisao.update({ where: { id: u4.rev.id }, data: { estado: "arquivado" } });
      await prisma.documentoRevisao.create({ data: { documentoId: u4.doc.id, numero: 2, createdById: coord.id, estado: "publicado" } });
      await prisma.documento.delete({ where: { id: base2.doc.id } });
      const antesRecusa = await contarApontamentos();
      const erros3d = {
        ret: await erroDe(aceitarPedidoModeloNoBanco({ id: pRet.id, quem: { id: coord.id }, resposta: null })),
        sub: await erroDe(aceitarPedidoModeloNoBanco({ id: pSub.id, quem: { id: coord.id }, resposta: null })),
        doc: await erroDe(aceitarPedidoModeloNoBanco({ id: pDoc.id, quem: { id: coord.id }, resposta: null })),
      };
      const vistas3d = await pedidosDoProjetoNoPortal(p3d.id, cliente.id);
      check(
        "modelo saiu das Entregas / recebido excluído: aceite recusado",
        erros3d.ret === MOTIVO_PRANCHA_RETIRADA &&
          erros3d.sub === MOTIVO_REVISAO_SUBSTITUIDA &&
          erros3d.doc === MOTIVO_PRANCHA_RETIRADA &&
          (await contarApontamentos()) === antesRecusa &&
          (await prisma.pedidoRevisaoCliente.count({ where: { id: { in: [pRet.id, pSub.id, pDoc.id] }, status: "aguardando" } })) === 3 &&
          vistas3d.find((v) => v.id === pRet.id)?.indisponivel === "retirada" &&
          vistas3d.find((v) => v.id === pSub.id)?.indisponivel === "substituida" &&
          (await erroDe(recusarPedidoNoBanco({ id: pSub.id, quem: { id: coord.id }, resposta: "Confira a revisão nova." }))) === null,
        erros3d,
      );

      // ── a prancha segue igual: os dois CHECKs do banco ──
      check(
        "pedido de prancha segue igual (prancha sem upload/revisão/documento e tipo desconhecido recusados pelo banco)",
        (await prisma.pedidoRevisaoCliente.count({ where: { projetoId: p1.id, tipo: { not: "prancha" } } })) === 0 &&
          (await erroDe(prisma.pedidoRevisaoCliente.create({ data: { projetoId: p3d.id, autorId: conta.id, comentario: "x" } }))) !== null &&
          (await erroDe(prisma.pedidoRevisaoCliente.create({ data: { tipo: "outro", projetoId: p3d.id, autorId: conta.id, comentario: "x" } }))) !== null &&
          (await erroDe(aceitarPedidoNoBanco({ id: pRet.id, quem, resposta: null }))) !== null,
      );
    }
  } finally {
    for (const c of arquivosSmoke) await removerArquivo(c).catch(() => {});
    for (const id of projetos) await prisma.projeto.delete({ where: { id } });
    for (const id of usuarios) await prisma.user.delete({ where: { id } });
    for (const id of clientes) await prisma.cliente.delete({ where: { id } });
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
