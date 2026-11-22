/**
 * Smoke da aprovação formal da entrega pelo portal (spec docs/superpowers/specs/2026-11-22-portal-aprovacao-entrega-design.md)
 * contra o banco de dev, sem o servidor no ar.
 *
 * Cenário próprio (clientes, projetos, contas, internos, documentos e arquivos com sufixo do smoke), apagado no fim.
 *
 * Confere: envio só com arquivos das Entregas, parcela só do projeto, projetista fora; a foto dos itens e a impressão
 * digital; resposta única (segunda resposta, duas contas ao mesmo tempo, cliente × registro por fora ao mesmo tempo);
 * outro cliente e cliente inativo recusam; desatualizado (substituído, excluído, tirado das Entregas) só enquanto
 * aguarda; texto obrigatório; impressão digital errada; cancelar; anular (volta a aguardar, dois ao mesmo tempo = um,
 * a anulada fica no banco).
 *
 * Uso: npm run smoke:portal-aprovacao-entrega
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { existsSync } from "node:fs";
import { removerArquivo, resolverCaminho, salvarArquivo } from "../src/lib/storage";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import {
  anularResposta,
  cancelarAprovacao,
  candidatosDoProjeto,
  comprovanteParaEquipe,
  gravarComprovante,
  limparComprovantesNaoUsados,
  desatualizadosDoProjeto,
  enviarAprovacao,
  registrarPorFora,
  responderPeloPortal,
  type Conta,
  type Equipe,
} from "../src/modules/portal/aprovacao-entrega/service";
import { impressaoDigital } from "../src/modules/portal/aprovacao-entrega/itens";
import {
  MOTIVO_CANCELADO,
  COMPROVANTES_SEM_USO_MAX,
  MOTIVO_COMPROVANTE,
  MOTIVO_COMPROVANTES_DEMAIS,
  MOTIVO_DESATUALIZADO,
  MOTIVO_ITEM_FORA,
  MOTIVO_JA_ANULADA,
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_NAO_ENCONTRADO,
  MOTIVO_PARCELA,
  MOTIVO_PEDIDO_MUDOU,
  MOTIVO_TEXTO_OBRIGATORIO,
} from "../src/modules/portal/aprovacao-entrega/regras";
import { diaDeSaoPaulo } from "../src/lib/data";
import { avisarAnulacao, avisarEnvio, avisarResposta, gestoresDoFinanceiro, type DepsAvisos } from "../src/modules/portal/aprovacao-entrega/avisos";
import { aprovacoesParaCliente, aprovacoesParaEquipe } from "../src/modules/portal/aprovacao-entrega/queries";
import { parcelasAFaturar } from "../src/modules/juridico/contrato/parcelas-a-faturar-queries";

const arquivoExiste = async (rel: string) => existsSync(resolverCaminho(rel));

async function main() {
  const tag = `SMKAPROVACAO_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const motivoDe = async (f: () => Promise<unknown>): Promise<string | null> => {
    try {
      await f();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) throw new Error("Banco de dev sem superusuário ativo.");
  const fase = await prisma.pranchaCatalogo.findFirst({ where: { categoria: "fase", ativo: true, projetoId: null }, select: { id: true } });
  if (!fase) throw new Error("Banco de dev sem fase no catálogo.");

  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];
  const contratos: string[] = [];
  const noDisco: string[] = [];

  try {
    const novoCliente = async (sufixo: string, ativo = true) => {
      const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}`, ativo } });
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
    const tipoTermo = tipoTermoPorTipo("externo");
    const novaConta = async (clienteId: string, sufixo: string) => {
      const u = await prisma.user.create({
        data: { name: `Mariana ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId },
      });
      usuarios.push(u.id);
      await prisma.aceiteTermo.create({
        data: { userId: u.id, tipo: tipoTermo, versao: TERMOS[tipoTermo].versao, conteudoHash: `${tag}_hash` },
      });
      return u;
    };
    const novoInterno = async (sufixo: string) => {
      const u = await prisma.user.create({
        data: { name: `Interno ${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno" },
      });
      usuarios.push(u.id);
      await prisma.permissaoUsuario.create({
        data: { userId: u.id, recurso: "escopo", acao: "global", permitido: false, motivo: `smoke ${tag}` },
      });
      return u;
    };
    /** Documento com uma revisão e um PDF validado no disco, marcado em Compartilhado (está nas Entregas). */
    const entrega = async (disciplinaId: string, nome: string, marcar = true) => {
      const doc = await prisma.documentoDisciplina.create({
        data: { disciplinaId, chave: `A/${tag}-${nome}.pdf`, nomeArquivo: `${tag}-${nome}.pdf`, titulo: `Planta ${nome}`, faseId: fase.id },
      });
      const rev = await prisma.documentoRevisao.create({ data: { documentoId: doc.id, numero: 2, createdById: admin.id } });
      const up = await prisma.upload.create({
        data: {
          disciplinaId,
          documentoId: doc.id,
          revisaoId: rev.id,
          pacote: "A",
          nomeArquivo: `${tag}-${nome}.pdf`,
          caminho: `smoke/${tag}-${nome}.pdf`,
          tamanho: 10,
          hashSha256: `${nome}`.padEnd(64, "0"),
          versao: 2,
          autorId: admin.id,
          validado: true,
        },
      });
      await salvarArquivo(up.caminho, Buffer.from("%PDF-1.4 smoke"));
      noDisco.push(up.caminho);
      if (marcar) await prisma.documentoDisciplina.update({ where: { id: doc.id }, data: { revisaoCompartilhadaId: rev.id } });
      return { doc, rev, up };
    };

    const cliA = await novoCliente("cliA");
    const cliB = await novoCliente("cliB");
    const cliInativo = await novoCliente("inativo", false);
    const proj = await novoProjeto(cliA.id, "P");
    const outroProj = await novoProjeto(cliA.id, "Q");
    const projInativo = await novoProjeto(cliInativo.id, "I");

    const contaA1 = await novaConta(cliA.id, "a1");
    const contaA2 = await novaConta(cliA.id, "a2");
    const contaB = await novaConta(cliB.id, "b1");
    const contaInativo = await novaConta(cliInativo.id, "inat");
    const coordU = await novoInterno("coord");
    const projetistaU = await novoInterno("projetista");
    const financeiroU = await novoInterno("financeiro");
    await prisma.projetoMembro.create({ data: { projetoId: proj.id, userId: coordU.id, papel: "coordenador" } });
    await prisma.projetoMembro.create({ data: { projetoId: proj.id, userId: projetistaU.id, papel: "projetista" } });
    await prisma.projetoMembro.create({ data: { projetoId: projInativo.id, userId: coordU.id, papel: "coordenador" } });
    const coord: Equipe = { userId: coordU.id, nome: coordU.name };
    const projetista: Equipe = { userId: projetistaU.id, nome: projetistaU.name };
    const c1: Conta = { userId: contaA1.id, nome: contaA1.name };
    const c2: Conta = { userId: contaA2.id, nome: contaA2.name };

    const e1 = await entrega(proj.disciplinaId, "e1");
    const e2 = await entrega(proj.disciplinaId, "e2");
    const e3 = await entrega(proj.disciplinaId, "e3");
    const e4 = await entrega(proj.disciplinaId, "e4");
    const naoMarcada = await entrega(proj.disciplinaId, "naomarcada", false);
    const ei = await entrega(projInativo.disciplinaId, "ei");

    const contrato = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} contrato`,
        tipo: "contrato",
        clienteId: cliA.id,
        projetoId: proj.id,
        statusContrato: "assinado",
        valor: 10000,
        formaCobranca: "por_entrega",
        parcelasEntrega: { create: [{ descricao: "Entrega do básico", percentual: 100, ordem: 0 }] },
      },
      include: { parcelasEntrega: true },
    });
    contratos.push(contrato.id);
    const parcela = contrato.parcelasEntrega[0];
    const contratoOutro = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} contrato Q`,
        tipo: "contrato",
        clienteId: cliA.id,
        projetoId: outroProj.id,
        statusContrato: "assinado",
        valor: 5000,
        formaCobranca: "por_entrega",
        parcelasEntrega: { create: [{ descricao: "Entrega Q", percentual: 100, ordem: 0 }] },
      },
      include: { parcelasEntrega: true },
    });
    contratos.push(contratoOutro.id);
    // Contrato do MESMO projeto, mas de outro cliente: a parcela não pode ser ligada.
    const contratoOutroCliente = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} contrato outro cliente`,
        tipo: "contrato",
        clienteId: cliB.id,
        projetoId: proj.id,
        statusContrato: "assinado",
        valor: 1000,
        formaCobranca: "por_entrega",
        parcelasEntrega: { create: [{ descricao: "Entrega B", percentual: 100, ordem: 0 }] },
      },
      include: { parcelasEntrega: true },
    });
    contratos.push(contratoOutroCliente.id);

    // ── Envio ──
    const candidatos = await candidatosDoProjeto(proj.id);
    check("candidatos = arquivos marcados nas Entregas", [e1, e2, e3, e4].every((e) => candidatos.some((c) => c.uploadId === e.up.id)) && !candidatos.some((c) => c.uploadId === naoMarcada.up.id));
    const base = { projetoId: proj.id, quem: coord, titulo: "Entrega BS", mensagem: "Confira", parcelaId: null as string | null };
    check("arquivo fora das Entregas recusa", (await motivoDe(() => enviarAprovacao({ ...base, uploadIds: [e1.up.id, naoMarcada.up.id] }))) === MOTIVO_ITEM_FORA);
    check("parcela de outro projeto recusa", (await motivoDe(() => enviarAprovacao({ ...base, uploadIds: [e1.up.id], parcelaId: contratoOutro.parcelasEntrega[0].id }))) === MOTIVO_PARCELA);
    check("parcela de contrato de outro cliente no mesmo projeto recusa", (await motivoDe(() => enviarAprovacao({ ...base, uploadIds: [e1.up.id], parcelaId: contratoOutroCliente.parcelasEntrega[0].id }))) === MOTIVO_PARCELA);
    check("projetista não envia", (await motivoDe(() => enviarAprovacao({ ...base, quem: projetista, uploadIds: [e1.up.id] }))) === MOTIVO_NAO_ENCONTRADO);

    const a1 = await enviarAprovacao({ ...base, uploadIds: [e2.up.id, e1.up.id], parcelaId: parcela.id });
    const pac1 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a1.id } });
    const itens1 = await prisma.aprovacaoEntregaItem.findMany({ where: { aprovacaoId: a1.id }, orderBy: { ordem: "asc" } });
    check(
      "foto dos itens: hash, título do documento e rótulo da revisão",
      itens1.length === 2 && itens1.every((i) => i.hashSha256.length === 64 && i.documentoTitulo.startsWith("Planta ") && i.revisaoRotulo === "R01"),
    );
    check("impressão digital = a dos itens", pac1.impressaoDigital === impressaoDigital(itens1) && pac1.parcelaId === parcela.id && pac1.status === "aguardando");

    // ── Resposta ──
    check("impressão digital errada recusa", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a1.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: "x" }))) === MOTIVO_PEDIDO_MUDOU);
    check("ressalvas sem texto recusa", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a1.id, conta: c1, resposta: "aprovado_com_ressalvas", texto: "  ", impressaoDigital: pac1.impressaoDigital }))) === MOTIVO_TEXTO_OBRIGATORIO);
    check("conta de outro cliente recusa", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a1.id, conta: { userId: contaB.id, nome: contaB.name }, resposta: "aprovado", texto: null, impressaoDigital: pac1.impressaoDigital }))) === MOTIVO_NAO_ENCONTRADO);
    const r1 = await responderPeloPortal({ aprovacaoId: a1.id, conta: c1, resposta: "aprovado_com_ressalvas", texto: "Trocar cota da porta", impressaoDigital: pac1.impressaoDigital });
    const resp1 = await prisma.respostaAprovacaoEntrega.findUniqueOrThrow({ where: { id: r1.respostaId } });
    check("cliente responde com ressalvas", resp1.origem === "portal" && resp1.respondidoPorId === contaA1.id && resp1.texto === "Trocar cota da porta" && resp1.impressaoDigital === pac1.impressaoDigital);
    check("segunda resposta recusa", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a1.id, conta: c2, resposta: "aprovado", texto: null, impressaoDigital: pac1.impressaoDigital }))) === MOTIVO_JA_RESPONDIDO);

    // Desatualizado só enquanto aguarda: substituir um arquivo de um pacote respondido não muda nada.
    const a2 = await enviarAprovacao({ ...base, uploadIds: [e3.up.id] });
    const pac2 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a2.id } });
    const corrida = await Promise.allSettled([
      responderPeloPortal({ aprovacaoId: a2.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: pac2.impressaoDigital }),
      responderPeloPortal({ aprovacaoId: a2.id, conta: c2, resposta: "nao_aprovado", texto: "não", impressaoDigital: pac2.impressaoDigital }),
    ]);
    const ativas2 = await prisma.respostaAprovacaoEntrega.count({ where: { aprovacaoId: a2.id, anuladaEm: null } });
    check(
      "duas contas ao mesmo tempo = uma resposta",
      ativas2 === 1 && corrida.filter((x) => x.status === "fulfilled").length === 1 &&
        corrida.some((x) => x.status === "rejected" && (x.reason as Error).message === MOTIVO_JA_RESPONDIDO),
    );

    // Cliente × registro por fora ao mesmo tempo (comprovante criado direto: a rota é da Task 4).
    const a3 = await enviarAprovacao({ ...base, uploadIds: [e3.up.id] });
    const pac3 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a3.id } });
    const comp3 = await prisma.comprovanteAprovacaoEntrega.create({
      data: { aprovacaoId: a3.id, enviadoPorId: coordU.id, caminho: `smoke/${tag}-comp3.pdf`, nome: "comp.pdf", tamanho: 10, tipo: "application/pdf" },
    });
    const corrida3 = await Promise.allSettled([
      responderPeloPortal({ aprovacaoId: a3.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: pac3.impressaoDigital }),
      registrarPorFora({ aprovacaoId: a3.id, quem: coord, resposta: "aprovado", texto: null, dia: diaDeSaoPaulo(), respondidoPorNome: "Sr. Cliente", comprovanteId: comp3.id }),
    ]);
    const ativas3 = await prisma.respostaAprovacaoEntrega.count({ where: { aprovacaoId: a3.id, anuladaEm: null } });
    const comp3Depois = await prisma.comprovanteAprovacaoEntrega.findUniqueOrThrow({ where: { id: comp3.id } });
    const porForaVenceu = corrida3[1].status === "fulfilled";
    check(
      "cliente × registro por fora ao mesmo tempo = uma resposta",
      ativas3 === 1 && corrida3.filter((x) => x.status === "fulfilled").length === 1 && (porForaVenceu ? comp3Depois.usadoEm !== null : comp3Depois.usadoEm === null),
    );

    // Cliente inativo: a conta dele não responde, nem com o pacote certo.
    const ai = await enviarAprovacao({ projetoId: projInativo.id, quem: coord, titulo: "Inativo", mensagem: null, uploadIds: [], parcelaId: null }).catch(() => null);
    check("pedido sem arquivos recusa", ai === null && (await candidatosDoProjeto(projInativo.id)).some((c) => c.uploadId === ei.up.id));
    const ai2 = await enviarAprovacao({ projetoId: projInativo.id, quem: coord, titulo: "Inativo", mensagem: null, uploadIds: [ei.up.id], parcelaId: null });
    const paci = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: ai2.id } });
    check(
      "conta de cliente inativo recusa",
      (await motivoDe(() => responderPeloPortal({ aprovacaoId: ai2.id, conta: { userId: contaInativo.id, nome: contaInativo.name }, resposta: "aprovado", texto: null, impressaoDigital: paci.impressaoDigital }))) === MOTIVO_NAO_ENCONTRADO,
    );

    // ── Desatualizado ──
    const a4 = await enviarAprovacao({ ...base, uploadIds: [e4.up.id] });
    const pac4 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a4.id } });
    const novo4 = await prisma.upload.create({
      data: { disciplinaId: proj.disciplinaId, documentoId: e4.doc.id, revisaoId: e4.rev.id, pacote: "A", nomeArquivo: `${tag}-e4b.pdf`, caminho: `smoke/${tag}-e4b.pdf`, tamanho: 10, hashSha256: "f".repeat(64), autorId: admin.id, validado: true },
    });
    await prisma.upload.updateMany({ where: { id: e4.up.id, substituidoPorId: { not: undefined } }, data: { substituidoPorId: novo4.id } });
    check("upload substituído: cliente recusa com desatualizado", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a4.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: pac4.impressaoDigital }))) === MOTIVO_DESATUALIZADO);
    check("desatualizadosDoProjeto marca o pacote substituído", (await desatualizadosDoProjeto(proj.id, [a4.id])).has(a4.id));

    const a5 = await enviarAprovacao({ ...base, uploadIds: [e2.up.id] });
    const pac5 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a5.id } });
    await prisma.upload.update({ where: { id: e2.up.id }, data: { excluidoEm: new Date() } });
    check("upload excluído: desatualizado", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a5.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: pac5.impressaoDigital }))) === MOTIVO_DESATUALIZADO);
    await prisma.upload.update({ where: { id: e2.up.id }, data: { excluidoEm: null } });

    const a6 = await enviarAprovacao({ ...base, uploadIds: [e2.up.id] });
    const pac6 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a6.id } });
    await prisma.documentoDisciplina.update({ where: { id: e2.doc.id }, data: { revisaoCompartilhadaId: null } });
    check("tirado das Entregas: desatualizado", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a6.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: pac6.impressaoDigital }))) === MOTIVO_DESATUALIZADO);
    check("pacote respondido nunca vira desatualizado", !(await desatualizadosDoProjeto(proj.id, [a1.id, a6.id])).has(a1.id) && (await desatualizadosDoProjeto(proj.id, [a6.id])).has(a6.id));
    await prisma.documentoDisciplina.update({ where: { id: e2.doc.id }, data: { revisaoCompartilhadaId: e2.rev.id } });

    // ── Cancelar ──
    check("cancelar aguardando", (await motivoDe(() => cancelarAprovacao({ aprovacaoId: a6.id, quem: coord }))) === null);
    check("cancelar de novo recusa", (await motivoDe(() => cancelarAprovacao({ aprovacaoId: a6.id, quem: coord }))) === MOTIVO_CANCELADO);
    check("cliente respondendo cancelado = não encontrado (não confirma que existe)", (await motivoDe(() => responderPeloPortal({ aprovacaoId: a6.id, conta: c1, resposta: "aprovado", texto: null, impressaoDigital: pac6.impressaoDigital }))) === MOTIVO_NAO_ENCONTRADO);
    check("equipe registrando por fora em cancelado = cancelado", (await motivoDe(() => registrarPorFora({ aprovacaoId: a6.id, quem: coord, resposta: "aprovado", texto: null, dia: diaDeSaoPaulo(), respondidoPorNome: "X", comprovanteId: "x" }))) === MOTIVO_CANCELADO);
    check("projetista não cancela", (await motivoDe(() => cancelarAprovacao({ aprovacaoId: a5.id, quem: projetista }))) === MOTIVO_NAO_ENCONTRADO);

    // ── Anular ──
    check("projetista não anula", (await motivoDe(() => anularResposta({ respostaId: r1.respostaId, quem: projetista, motivo: "x" }))) === MOTIVO_NAO_ENCONTRADO);
    const corridaAnular = await Promise.allSettled([
      anularResposta({ respostaId: r1.respostaId, quem: coord, motivo: "Cliente marcou errado" }),
      anularResposta({ respostaId: r1.respostaId, quem: coord, motivo: "Cliente marcou errado" }),
    ]);
    const depois = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a1.id }, select: { status: true } });
    const anulada = await prisma.respostaAprovacaoEntrega.findUniqueOrThrow({ where: { id: r1.respostaId } });
    check(
      "anular duas vezes ao mesmo tempo = uma",
      corridaAnular.filter((x) => x.status === "fulfilled").length === 1 &&
        corridaAnular.some((x) => x.status === "rejected" && (x.reason as Error).message === MOTIVO_JA_ANULADA),
    );
    check("anular volta a aguardar e a anulada fica no banco", depois.status === "aguardando" && anulada.anuladaEm !== null && anulada.motivoAnulacao === "Cliente marcou errado" && anulada.anuladaPorId === coordU.id);
    const r1b = await responderPeloPortal({ aprovacaoId: a1.id, conta: c2, resposta: "aprovado", texto: null, impressaoDigital: pac1.impressaoDigital });
    check("depois de anular, nova resposta entra", (await prisma.respostaAprovacaoEntrega.count({ where: { aprovacaoId: a1.id } })) === 2 && r1b.respostaId !== r1.respostaId);

    // ── Leituras e avisos (Task 3) ──
    const sinos: { userId: string; titulo: string; categoria: string | null }[] = [];
    const emails: { to: string; slug: string }[] = [];
    const deps: DepsAvisos = {
      notificar: async (ids, n, o) => {
        for (const userId of ids) sinos.push({ userId, titulo: n.titulo, categoria: o?.categoria ?? null });
      },
      enviarEmail: async (to, slug) => {
        emails.push({ to, slug });
        return true;
      },
      gestoresFinanceiro: async () => [financeiroU.id],
    };
    const limparAvisos = () => {
      sinos.length = 0;
      emails.length = 0;
    };
    const sinosDe = (id: string) => sinos.filter((s) => s.userId === id);

    const a7 = await enviarAprovacao({ ...base, uploadIds: [e1.up.id], parcelaId: parcela.id });
    const pac7 = await prisma.aprovacaoEntrega.findUniqueOrThrow({ where: { id: a7.id } });
    limparAvisos();
    await avisarEnvio(a7.id, deps);
    check(
      "envio: 1 sino + 1 e-mail por conta ativa do cliente, nada a outro cliente",
      sinosDe(contaA1.id).length === 1 && sinosDe(contaA2.id).length === 1 && sinosDe(contaB.id).length === 0 &&
        emails.filter((e) => e.slug === "portal-aprovacao-entrega").length === 2 && sinos.every((s) => s.categoria === null),
    );
    limparAvisos();
    await avisarEnvio(a7.id, { ...deps, enviarEmail: null });
    check("envio sem SMTP: só sinos", sinos.length === 2 && emails.length === 0);
    limparAvisos();
    await avisarEnvio(ai2.id, deps);
    check("envio a cliente inativo: ninguém", sinos.length === 0 && emails.length === 0);

    const r7 = await responderPeloPortal({ aprovacaoId: a7.id, conta: c1, resposta: "aprovado_com_ressalvas", texto: "Detalhe", impressaoDigital: pac7.impressaoDigital });
    limparAvisos();
    await avisarResposta(r7.respostaId, deps);
    check(
      "resposta do cliente: coordenador e financeiro avisados, projetista não",
      sinosDe(coordU.id).length === 1 && sinosDe(projetistaU.id).length === 0 && sinosDe(financeiroU.id).length === 1 &&
        sinos.every((s) => s.categoria === "aprovacao_entrega"),
    );
    const mAceita = (await parcelasAFaturar({ projetoId: proj.id })).find((p) => p.parcelaId === parcela.id)?.aceite;
    check("parcela marcada aceita com ressalvas", mAceita?.tipo === "aceita" && mAceita.ressalvas === true);
    check("parcelasAFaturar({ projetoId }) traz só as do projeto", (await parcelasAFaturar({ projetoId: proj.id })).every((p) => p.projeto?.id === proj.id));

    await anularResposta({ respostaId: r7.respostaId, quem: coord, motivo: "Engano" });
    limparAvisos();
    await avisarAnulacao(r7.respostaId, deps);
    check("anulação: sino às contas do cliente e ao financeiro", sinosDe(contaA1.id).length === 1 && sinosDe(contaA2.id).length === 1 && sinosDe(financeiroU.id).length === 1);
    const mDepois = (await parcelasAFaturar({ projetoId: proj.id })).find((p) => p.parcelaId === parcela.id)?.aceite;
    check("depois de anular, a marca ignora a anulada", mDepois?.tipo === "aceita" && mDepois.titulo === "Entrega BS");

    const r7b = await responderPeloPortal({ aprovacaoId: a7.id, conta: c1, resposta: "nao_aprovado", texto: "Não", impressaoDigital: pac7.impressaoDigital });
    limparAvisos();
    await avisarResposta(r7b.respostaId, deps);
    check("não aprovo com parcela: financeiro não é avisado", sinosDe(financeiroU.id).length === 0 && sinosDe(coordU.id).length === 1);

    const doCliente = await aprovacoesParaCliente(proj.id, contaA1.id);
    const daEquipe = await aprovacoesParaEquipe(proj.id, coordU.id);
    const p7c = doCliente?.find((x) => x.id === a7.id);
    check(
      "cliente: sem cancelado, sem nomes internos nem parcela",
      !!doCliente && !doCliente.some((x) => x.status === "cancelado") && p7c?.enviadoPorNome === null && p7c?.parcela === null &&
        p7c.respostas.every((r) => r.registradoPorNome === null && r.comprovante === null && (r.anulada?.por ?? null) === null),
    );
    check("cliente: pendentes no topo", doCliente !== null && doCliente.findIndex((x) => x.status !== "aguardando") >= doCliente.filter((x) => x.status === "aguardando").length);
    check(
      "equipe: vê cancelado, nome de quem anulou e a parcela",
      !!daEquipe && daEquipe.some((x) => x.status === "cancelado") &&
        daEquipe.find((x) => x.id === a7.id)?.respostas.some((r) => r.anulada?.por === coord.nome) === true &&
        daEquipe.find((x) => x.id === a7.id)?.parcela?.id === parcela.id,
    );
    check("projetista: leitura da equipe = null", (await aprovacoesParaEquipe(proj.id, projetistaU.id)) === null);
    check("outro cliente: leitura do cliente = null", (await aprovacoesParaCliente(proj.id, contaB.id)) === null);

    // ── Comprovante (Task 4) ──
    const a8 = await enviarAprovacao({ ...base, uploadIds: [e3.up.id] });
    const a9 = await enviarAprovacao({ ...base, uploadIds: [e3.up.id] });
    const porFora = (comprovanteId: string, aprovacaoId = a8.id) =>
      registrarPorFora({ aprovacaoId, quem: coord, resposta: "aprovado", texto: null, dia: diaDeSaoPaulo(), respondidoPorNome: "Sr. Cliente", comprovanteId });
    check("projetista não envia comprovante", (await motivoDe(() => gravarComprovante({ aprovacaoId: a8.id, quem: projetista, caminho: "x", nome: "c.pdf", tamanho: 10, tipo: "application/pdf" }))) === MOTIVO_NAO_ENCONTRADO);
    const compOutra = await gravarComprovante({ aprovacaoId: a9.id, quem: coord, caminho: `smoke/${tag}-c9.pdf`, nome: "c9.pdf", tamanho: 10, tipo: "application/pdf" });
    check("comprovante inexistente recusa", (await motivoDe(() => porFora("nao-existe"))) === MOTIVO_COMPROVANTE);
    check("comprovante de outro pacote recusa", (await motivoDe(() => porFora(compOutra.comprovanteId))) === MOTIVO_COMPROVANTE);
    const outroCoordU = await novoInterno("coord2");
    await prisma.projetoMembro.create({ data: { projetoId: proj.id, userId: outroCoordU.id, papel: "coordenador" } });
    const compAlheio = await gravarComprovante({ aprovacaoId: a8.id, quem: { userId: outroCoordU.id, nome: outroCoordU.name }, caminho: `smoke/${tag}-c8b.pdf`, nome: "c8b.pdf", tamanho: 10, tipo: "application/pdf" });
    check("comprovante enviado por outra pessoa recusa", (await motivoDe(() => porFora(compAlheio.comprovanteId))) === MOTIVO_COMPROVANTE);
    const comp8Caminho = `smoke/${tag}-c8.pdf`;
    await salvarArquivo(comp8Caminho, Buffer.from("%PDF-1.4 comprovante"));
    noDisco.push(comp8Caminho);
    const comp8 = await gravarComprovante({ aprovacaoId: a8.id, quem: coord, caminho: comp8Caminho, nome: "email do cliente.pdf", tamanho: 20, tipo: "application/pdf" });
    const r8 = await porFora(comp8.comprovanteId);
    const resp8 = await prisma.respostaAprovacaoEntrega.findUniqueOrThrow({ where: { id: r8.respostaId } });
    const c8 = await prisma.comprovanteAprovacaoEntrega.findUniqueOrThrow({ where: { id: comp8.comprovanteId } });
    check(
      "registro por fora grava origem equipe, o dia (meio-dia de SP) e marca o comprovante",
      resp8.origem === "equipe" && diaDeSaoPaulo(resp8.respondidoEm) === diaDeSaoPaulo() &&
        resp8.registradoPorId === coordU.id && resp8.respondidoPorNome === "Sr. Cliente" && c8.usadoEm !== null && resp8.comprovanteId === comp8.comprovanteId,
    );
    check("só pacote aguardando recebe comprovante", (await motivoDe(() => gravarComprovante({ aprovacaoId: a8.id, quem: coord, caminho: "y", nome: "y.pdf", tamanho: 1, tipo: "application/pdf" }))) === MOTIVO_JA_RESPONDIDO);
    await anularResposta({ respostaId: r8.respostaId, quem: coord, motivo: "Registrado errado" });
    check("comprovante já usado recusa", (await motivoDe(() => porFora(comp8.comprovanteId))) === MOTIVO_COMPROVANTE);
    check("comprovante: projetista = null", (await comprovanteParaEquipe(comp8.comprovanteId, projetistaU.id)) === null);
    check("comprovante: coordenador recebe o caminho", (await comprovanteParaEquipe(comp8.comprovanteId, coordU.id))?.caminho === comp8Caminho);
    check("comprovante: conta do cliente = null", (await comprovanteParaEquipe(comp8.comprovanteId, contaA1.id)) === null);
    const daquiA25h = new Date(Date.now() + 25 * 3600_000);
    const arquivoVelho = `smoke/${tag}-c9-disco.pdf`;
    await salvarArquivo(arquivoVelho, Buffer.from("%PDF-1.4 velho"));
    noDisco.push(arquivoVelho);
    await prisma.comprovanteAprovacaoEntrega.update({ where: { id: compOutra.comprovanteId }, data: { caminho: arquivoVelho } });
    const apagados = await limparComprovantesNaoUsados(daquiA25h);
    check("limpeza tira o arquivo do disco", !(await arquivoExiste(arquivoVelho)));
    const sobrou = await prisma.comprovanteAprovacaoEntrega.findMany({ where: { aprovacaoId: { in: [a8.id, a9.id] } }, select: { id: true } });
    check(
      "limpeza apaga o não usado depois de 24 h e mantém o usado",
      apagados >= 2 && sobrou.length === 1 && sobrou[0].id === comp8.comprovanteId,
    );
    // Coordenador de OUTRO projeto: não baixa o comprovante nem cancela pedido daqui.
    const coordQ = await novoInterno("coordq");
    await prisma.projetoMembro.create({ data: { projetoId: outroProj.id, userId: coordQ.id, papel: "coordenador" } });
    check("coordenador de outro projeto: comprovante = null", (await comprovanteParaEquipe(comp8.comprovanteId, coordQ.id)) === null);
    check("coordenador de outro projeto não cancela", (await motivoDe(() => cancelarAprovacao({ aprovacaoId: a9.id, quem: { userId: coordQ.id, nome: coordQ.name } }))) === MOTIVO_NAO_ENCONTRADO);

    // Teto de comprovantes sem uso por pessoa e pedido.
    const a11 = await enviarAprovacao({ ...base, uploadIds: [e3.up.id] });
    for (let i = 0; i < COMPROVANTES_SEM_USO_MAX; i++) {
      await gravarComprovante({ aprovacaoId: a11.id, quem: coord, caminho: `smoke/${tag}-c11-${i}.pdf`, nome: `c${i}.pdf`, tamanho: 10, tipo: "application/pdf" });
    }
    check("comprovante além do teto sem uso recusa", (await motivoDe(() => gravarComprovante({ aprovacaoId: a11.id, quem: coord, caminho: `smoke/${tag}-c11-x.pdf`, nome: "cx.pdf", tamanho: 10, tipo: "application/pdf" }))) === MOTIVO_COMPROVANTES_DEMAIS);

    // Marca da parcela com resposta por fora: o dia mostrado é o dia informado.
    const a10 = await enviarAprovacao({ ...base, uploadIds: [e3.up.id], parcelaId: parcela.id });
    const comp10 = await gravarComprovante({ aprovacaoId: a10.id, quem: coord, caminho: `smoke/${tag}-c10.pdf`, nome: "c10.pdf", tamanho: 10, tipo: "application/pdf" });
    await registrarPorFora({ aprovacaoId: a10.id, quem: coord, resposta: "aprovado", texto: null, dia: diaDeSaoPaulo(), respondidoPorNome: "Sr. Cliente", comprovanteId: comp10.comprovanteId });
    const m10 = (await parcelasAFaturar({ projetoId: proj.id })).find((p) => p.parcelaId === parcela.id)?.aceite;
    check("marca da parcela por fora: dia = o informado", m10?.tipo === "aceita" && m10.em === diaDeSaoPaulo() && m10.titulo === base.titulo);

    // Quem gere o financeiro é só interno (conta do portal com financeiro:gerir nunca entra).
    await prisma.permissaoUsuario.create({ data: { userId: contaA2.id, recurso: "financeiro", acao: "gerir", permitido: true, motivo: `smoke ${tag}` } });
    const gestores = (await gestoresDoFinanceiro()).filter((id) => id === contaA2.id);
    check("gestores do financeiro: conta externa com financeiro:gerir fica fora", gestores.length === 0);

    const compNovo = await gravarComprovante({ aprovacaoId: a9.id, quem: coord, caminho: `smoke/${tag}-c9b.pdf`, nome: "c9b.pdf", tamanho: 10, tipo: "application/pdf" });
    await limparComprovantesNaoUsados(new Date());
    check("limpeza antes de 24 h não apaga", (await prisma.comprovanteAprovacaoEntrega.count({ where: { id: compNovo.comprovanteId } })) === 1);
  } finally {
    const remover = async (rotulo: string, id: string, apagar: () => Promise<unknown>) => {
      try {
        await apagar();
      } catch (e) {
        console.error(`[limpeza] não removeu ${rotulo} ${id}:`, e);
      }
    };
    for (const id of contratos) await remover("contrato", id, () => prisma.documentoJuridico.delete({ where: { id } }));
    // O projeto leva pacotes, itens, respostas, comprovantes, disciplinas e uploads (cascade).
    for (const id of projetos) await remover("projeto", id, () => prisma.projeto.delete({ where: { id } }));
    for (const id of usuarios) await remover("usuário", id, () => prisma.user.delete({ where: { id } }));
    for (const id of clientes) await remover("cliente", id, () => prisma.cliente.delete({ where: { id } }));
    for (const c of noDisco) await remover("arquivo", c, () => removerArquivo(c));
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
