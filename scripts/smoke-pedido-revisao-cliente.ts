/**
 * Smoke do pedido de revisão do cliente (spec docs/superpowers/specs/2026-11-19-portal-pedido-revisao-design.md) contra
 * o banco de dev. As regras são puras e estão em `modules/portal/pedido-revisao/regras.test.ts`; aqui vai a ligação com
 * o banco: quem pode pedir (prancha nas Entregas, outro cliente), o aceite marcando "Em revisão" pelo serviço do ciclo,
 * as corridas (dois aceites, aceite × cancelamento), a recusa e a revisão substituída.
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
  aceitarPedidoNoBanco,
  anexoParaBaixar,
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

    // ── leitura do portal ──
    const doCliente = await pedidosDoProjetoNoPortal(p1.id, cliente.id);
    check(
      "portal: lista os pedidos do projeto sem quem respondeu",
      doCliente.length === 7 && doCliente.every((x) => !("respondidoPor" in x) && !("respondidoPorId" in x)),
      doCliente.length,
    );
    check("portal: outro cliente não vê os pedidos", (await pedidosDoProjetoNoPortal(p1.id, outro.id)).length === 0);

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
  } finally {
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
