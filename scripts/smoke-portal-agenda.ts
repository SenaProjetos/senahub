/**
 * Smoke da agenda do portal (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md) contra o banco de dev,
 * sem o servidor no ar e sem SMTP (`enviar` e `notificar` falsos gravam em listas).
 *
 * Cenário próprio (clientes, projetos, contratos, EAP com marcos, contas e internos com sufixo do smoke), apagado no fim. Guarda
 * a configuração `portal.resumoDiario` de antes e a devolve.
 *
 * Confere: marcos (cronograma em rascunho, Combinado × Previsão, fora da BL-00, entregue, contrato por data/aditivo, outro
 * cliente/inativo, allow-list do DTO); nota (audiência, 500, entregue, remover, corrida); reuniões (validações, remarcar,
 * cancelar, corrida, dia passado); ata ligada à reunião (antes do dia, corrida, segunda ata, ata retirada); conferência da
 * previsão (primeira vez, mudança, volta ao mesmo valor, em revisão, adiantar); resumo diário (itens, texto escapado, reserva).
 *
 * Uso: npm run smoke:portal-agenda
 */
import "dotenv/config";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { diaDeSaoPaulo } from "../src/lib/data";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import { agendaParaCliente, agendaParaEquipe, itensDoResumoDaAgenda } from "../src/modules/portal/agenda/queries";
import { conferirPrevisoes } from "../src/modules/portal/agenda/conferencia";
import { agendarReuniao, cancelarReuniao, editarReuniao, removerNota, salvarNota } from "../src/modules/portal/agenda/service";
import {
  MOTIVO_AGENDA_NAO_ENCONTRADA,
  MOTIVO_MARCO_ENTREGUE,
  MOTIVO_NOTA_LONGA,
  MOTIVO_SEM_NOTA,
} from "../src/modules/portal/agenda/marcos";
import {
  MOTIVO_ATA_ANTES_DO_DIA,
  MOTIVO_DIA_PASSADO,
  MOTIVO_JA_TEM_ATA,
  MOTIVO_REUNIAO_CANCELADA,
  MOTIVO_REUNIAO_MUDOU,
  MOTIVO_REUNIAO_PASSADA,
} from "../src/modules/portal/agenda/reunioes";
import { MOTIVO_NAO_ENCONTRADA } from "../src/modules/portal/atas/regras";
import { criarReuniaoComRascunho, publicar, retirarAta } from "../src/modules/portal/atas/service";
import { CHAVE_CONFIG_RESUMO, somarDiasIso } from "../src/modules/portal/resumo-diario";
import { rodarResumoDiario, salvarConfigResumo } from "../src/modules/portal/resumo-service";

const d = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const diaIso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

async function main() {
  const tag = `SMKAGENDA_${Date.now()}`;
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

  const hoje = diaDeSaoPaulo();
  const ontem = somarDiasIso(hoje, -1);
  const amanha = somarDiasIso(hoje, 1);
  const mais = (n: number) => somarDiasIso(hoje, n);

  const configAntes = await prisma.configSistema.findUnique({ where: { chave: CHAVE_CONFIG_RESUMO } });
  const clientes: string[] = [];
  const projetos: string[] = [];
  const contratos: string[] = [];
  const usuarios: string[] = [];

  try {
    const novoCliente = async (sufixo: string, ativo = true) => {
      const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}`, ativo } });
      clientes.push(c.id);
      return c;
    };
    const novoProjeto = async (clienteId: string, sufixo: string) => {
      const p = await prisma.$transaction(async (tx) => {
        const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
        return tx.projeto.create({ data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${sufixo}`, clienteId, prazoContrato: d(mais(300)) } });
      });
      projetos.push(p.id);
      return p;
    };
    const tipoTermo = tipoTermoPorTipo("externo");
    const novaConta = async (clienteId: string, nome: string, sufixo: string) => {
      const u = await prisma.user.create({
        data: { name: nome, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId, createdAt: new Date(Date.now() - 5 * 86_400_000) },
      });
      usuarios.push(u.id);
      await prisma.aceiteTermo.create({ data: { userId: u.id, tipo: tipoTermo, versao: TERMOS[tipoTermo].versao, conteudoHash: `${tag}_hash` } });
      return u;
    };
    const novoInterno = async (nome: string, sufixo: string) => {
      const u = await prisma.user.create({ data: { name: nome, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno" } });
      usuarios.push(u.id);
      await prisma.permissaoUsuario.create({ data: { userId: u.id, recurso: "escopo", acao: "global", permitido: false, motivo: `smoke ${tag}` } });
      return u;
    };
    const novoMarco = async (projetoId: string, nome: string, fim: string, extra: Prisma.EapTarefaUncheckedCreateInput | object = {}) =>
      prisma.eapTarefa.create({
        data: { projetoId, nome, tipoEap: "mrc", duracaoDias: 0, inicioPrevisto: d(fim), fimPrevisto: d(fim), ...extra } as Prisma.EapTarefaUncheckedCreateInput,
      });

    const cliA = await novoCliente("cliA");
    const cliB = await novoCliente("cliB");
    const cliInativo = await novoCliente("inativo", false);
    const proj = await novoProjeto(cliA.id, "P");
    const projRascunho = await novoProjeto(cliA.id, "R");
    const projInativo = await novoProjeto(cliInativo.id, "I");
    const joana = await novaConta(cliA.id, "Joana Prado", "joana");
    const contaB = await novaConta(cliB.id, "Bia Souza", "bia");
    const contaInativo = await novaConta(cliInativo.id, "Inês Inativa", "ines");
    const coordU = await novoInterno("Carlos Mendes", "coord");
    const projetistaU = await novoInterno("Pedro Projetista", "projetista");
    const foraU = await novoInterno("Fora do Projeto", "fora");
    for (const [p, u, papel] of [
      [proj.id, coordU.id, "coordenador"],
      [proj.id, projetistaU.id, "projetista"],
      [projRascunho.id, coordU.id, "coordenador"],
      [projInativo.id, coordU.id, "coordenador"],
    ] as const) {
      await prisma.projetoMembro.create({ data: { projetoId: p, userId: u, papel } });
    }

    // ── EAP: 4 marcos com parcela de contrato + cronograma aprovado + BL-00 ──
    const m1 = await novoMarco(proj.id, "Linha interna secreta ALFA", mais(30));
    const m2 = await novoMarco(proj.id, "Linha interna secreta BETA", mais(8));
    const m3 = await novoMarco(proj.id, "Linha interna secreta GAMA", mais(-1), { status: "con", progresso: 100, fimReal: d(ontem) });
    const m4 = await novoMarco(proj.id, "Linha interna secreta DELTA", mais(40));
    await prisma.cronogramaProjeto.create({ data: { projetoId: proj.id, aprovado: true } });
    const bl0 = await prisma.eapBaseline.create({ data: { projetoId: proj.id, numero: 0 } });
    for (const [m, fim] of [
      [m1, mais(10)],
      [m2, mais(8)],
      [m3, mais(-5)],
    ] as const) {
      await prisma.eapBaselineLinha.create({ data: { baselineId: bl0.id, tarefaId: m.id, nome: m.nome, inicio: d(fim), fim: d(fim), duracaoDias: 0 } });
    }
    const contrato = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} Contrato`,
        tipo: "contrato",
        projetoId: proj.id,
        clienteId: cliA.id,
        statusContrato: "assinado",
        formaCobranca: "por_entrega",
        assinadoEm: new Date(Date.now() - 60 * 86_400_000),
        dataVencimento: d(mais(200)),
        valor: new Prisma.Decimal("98765.43"),
        parcelasEntrega: {
          create: [
            { descricao: "Assinatura", percentual: new Prisma.Decimal("10"), ordem: 0, naAssinatura: true },
            { descricao: "Entrega do projeto básico", percentual: new Prisma.Decimal("30"), ordem: 1, marcoId: m1.id },
            { descricao: "Entrega do projeto executivo", percentual: new Prisma.Decimal("30"), ordem: 2, marcoId: m2.id },
            { descricao: "Entrega do As Built", percentual: new Prisma.Decimal("20"), ordem: 3, marcoId: m3.id },
            { descricao: "Entrega do complementar", percentual: new Prisma.Decimal("10"), ordem: 4, marcoId: m4.id },
          ],
        },
      },
      include: { parcelasEntrega: true },
    });
    contratos.push(contrato.id);
    const outros = [
      { titulo: "por data", tipo: "contrato", formaCobranca: "por_data" as const, status: "assinado" as const },
      { titulo: "aditivo", tipo: "aditivo", formaCobranca: "por_entrega" as const, status: "assinado" as const },
      { titulo: "rascunho", tipo: "contrato", formaCobranca: "por_entrega" as const, status: "rascunho" as const },
    ];
    for (const o of outros) {
      const c = await prisma.documentoJuridico.create({
        data: { titulo: `${tag} ${o.titulo}`, tipo: o.tipo, projetoId: proj.id, clienteId: cliA.id, statusContrato: o.status, formaCobranca: o.formaCobranca },
      });
      contratos.push(c.id);
    }

    // Projeto com cronograma em rascunho: contrato por entrega assinado, marco sem BL-00.
    const mR = await novoMarco(projRascunho.id, "Linha de rascunho", mais(20));
    await prisma.cronogramaProjeto.create({ data: { projetoId: projRascunho.id, aprovado: false } });
    const contratoR = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} Contrato R`,
        tipo: "contrato",
        projetoId: projRascunho.id,
        clienteId: cliA.id,
        statusContrato: "assinado",
        formaCobranca: "por_entrega",
        assinadoEm: new Date(Date.now() - 10 * 86_400_000),
        parcelasEntrega: { create: [{ descricao: "Entrega única", percentual: new Prisma.Decimal("100"), ordem: 0, marcoId: mR.id }] },
      },
    });
    contratos.push(contratoR.id);

    const parcelaDe = (marcoId: string) => contrato.parcelasEntrega.find((p) => p.marcoId === marcoId)!;

    // ── Marcos para o cliente ──
    const itensA = await agendaParaCliente(proj.id, joana.id);
    const marcos = (itensA ?? []).filter((i) => i.tipo === "marco");
    const marcoDe = (id: string) => marcos.find((m) => m.tipo === "marco" && m.chave === parcelaDe(id).id);
    check("cliente vê 4 marcos, assinatura, prazo e vigência", marcos.length === 4 && ["assinatura", "prazo", "vigencia"].every((t) => itensA?.some((i) => i.tipo === t)));
    const mm1 = marcoDe(m1.id);
    check("marco alterado: combinado (BL-00) × previsão, +20 dias", mm1?.tipo === "marco" && mm1.combinado === mais(10) && mm1.previsao === mais(30) && mm1.diferencaDias === 20 && mm1.situacao === "alterada");
    const mm2 = marcoDe(m2.id);
    check("marco no prazo", mm2?.tipo === "marco" && mm2.situacao === "no_prazo" && mm2.diferencaDias === 0);
    const mm3 = marcoDe(m3.id);
    check("marco concluído = entregue na data real, com o combinado à vista", mm3?.tipo === "marco" && mm3.situacao === "entregue" && mm3.entregueEm === ontem && mm3.combinado === mais(-5));
    const mm4 = marcoDe(m4.id);
    check("marco fora da BL-00 mostra só a previsão", mm4?.tipo === "marco" && mm4.combinado === null && mm4.diferencaDias === null && mm4.situacao === "sem_combinado");
    const json = JSON.stringify(itensA);
    check(
      "allow-list: sem valor, percentual, id nem nome de linha da EAP, nem pessoa da equipe",
      !json.includes("98765") && !json.includes("percentual") && !json.includes("secreta") && ![m1.id, m2.id, m3.id, m4.id].some((id) => json.includes(id)) && !json.includes("Carlos") && !json.includes("notaPor") && !json.includes("criadaPor"),
    );
    const primeiroPassado = itensA!.findIndex((i) => i.passado);
    check("entregues e passados vêm no fim, marcados como passado", primeiroPassado > 0 && itensA!.slice(primeiroPassado).every((i) => i.passado));
    check("prazo do projeto (gravado como data) mostra o mesmo dia, não o anterior", itensA?.some((i) => i.tipo === "prazo" && i.dia === mais(300)) === true);
    // Contrato de OUTRO cliente apontando um marco deste projeto: não vira marco para o cliente A.
    const m5 = await novoMarco(proj.id, "Linha interna secreta EPSILON", mais(50));
    const contratoDeOutro = await prisma.documentoJuridico.create({
      data: {
        titulo: `${tag} Contrato de outro cliente`,
        tipo: "contrato",
        projetoId: proj.id,
        clienteId: cliB.id,
        statusContrato: "assinado",
        formaCobranca: "por_entrega",
        parcelasEntrega: { create: [{ descricao: "Entrega de outro cliente", percentual: new Prisma.Decimal("100"), ordem: 0, marcoId: m5.id }] },
      },
    });
    contratos.push(contratoDeOutro.id);
    const depoisDoOutro = await agendaParaCliente(proj.id, joana.id);
    check("contrato de outro cliente no mesmo projeto não vira marco", depoisDoOutro?.filter((i) => i.tipo === "marco").length === 4 && !JSON.stringify(depoisDoOutro).includes("outro cliente"));
    check("outro cliente não vê a agenda", (await agendaParaCliente(proj.id, contaB.id)) === null);
    check("cliente inativo não vê a agenda", (await agendaParaCliente(projInativo.id, contaInativo.id)) === null);
    const itensR = await agendaParaCliente(projRascunho.id, joana.id);
    check("cronograma em rascunho: sem marcos, mas com assinatura", itensR !== null && !itensR.some((i) => i.tipo === "marco") && itensR.some((i) => i.tipo === "assinatura"));
    const eqR = await agendaParaEquipe(projRascunho.id, coordU.id);
    check("a equipe vê por que o cliente não vê marcos", eqR !== null && (eqR.semMarcosPorque ?? "").includes("rascunho"));

    // ── Audiência da equipe ──
    check("projetista não lê a agenda da equipe", (await agendaParaEquipe(proj.id, projetistaU.id)) === null);
    check("interno de fora do projeto não lê", (await agendaParaEquipe(proj.id, foraU.id)) === null);
    check("coordenação lê marcos e reuniões", (await agendaParaEquipe(proj.id, coordU.id))?.marcos.length === 4);

    // ── Nota de motivo ──
    const nota = { projetoId: proj.id, marcoId: m1.id, userId: coordU.id };
    check("projetista não escreve nota", (await motivoDe(() => salvarNota({ ...nota, userId: projetistaU.id, nota: "x" }))) === MOTIVO_AGENDA_NAO_ENCONTRADA);
    check("nota vazia recusa", (await motivoDe(() => salvarNota({ ...nota, nota: "   " }))) !== null);
    check("nota de 501 caracteres recusa", (await motivoDe(() => salvarNota({ ...nota, nota: "a".repeat(501) }))) === MOTIVO_NOTA_LONGA);
    check("marco de outro projeto recusa", (await motivoDe(() => salvarNota({ projetoId: proj.id, marcoId: mR.id, userId: coordU.id, nota: "x" }))) === MOTIVO_AGENDA_NAO_ENCONTRADA);
    check("marco entregue recusa a nota", (await motivoDe(() => salvarNota({ projetoId: proj.id, marcoId: m3.id, userId: coordU.id, nota: "x" }))) === MOTIVO_MARCO_ENTREGUE);
    check("remover sem nota recusa", (await motivoDe(() => removerNota(nota))) === MOTIVO_SEM_NOTA);
    const concorrentes = await Promise.allSettled([salvarNota({ ...nota, nota: "Primeira" }), salvarNota({ ...nota, nota: "Segunda" })]);
    check("dois salvamentos ao mesmo tempo terminam com uma linha só", concorrentes.every((x) => x.status === "fulfilled") && (await prisma.marcoAgendaPortal.count({ where: { marcoId: m1.id } })) === 1);
    await salvarNota({ ...nota, nota: "Aguardando *aprovação* do cliente" });
    const comNota = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "marco" && i.chave === parcelaDe(m1.id).id);
    check("o cliente lê a nota, sem o nome de quem escreveu", comNota?.tipo === "marco" && comNota.nota === "Aguardando *aprovação* do cliente");
    const naEquipe = (await agendaParaEquipe(proj.id, coordU.id))!.marcos.find((m) => m.marcoId === m1.id);
    check("a equipe vê quem escreveu a nota", naEquipe?.notaPorNome === coordU.name);
    // Marco entregue: a nota guardada não aparece para o cliente.
    await prisma.marcoAgendaPortal.create({ data: { projetoId: proj.id, marcoId: m3.id, nota: "nota antiga", notaPorId: coordU.id, notaEm: new Date() } });
    const entregueComNota = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "marco" && i.chave === parcelaDe(m3.id).id);
    check("nota de marco entregue não chega ao cliente", entregueComNota?.tipo === "marco" && entregueComNota.nota === null);
    check("remover entregue recusa", (await motivoDe(() => removerNota({ projetoId: proj.id, marcoId: m3.id, userId: coordU.id }))) === MOTIVO_MARCO_ENTREGUE);

    // ── Reuniões: validações ──
    const base = { projetoId: proj.id, userId: coordU.id, titulo: "Alinhamento", dia: mais(5), horaInicio: "14:00", duracaoMinutos: 60, link: "https://meet.google.com/abc-defg-hij", local: null, pauta: null };
    check("projetista não agenda", (await motivoDe(() => agendarReuniao({ ...base, userId: projetistaU.id }))) === MOTIVO_AGENDA_NAO_ENCONTRADA);
    check("dia passado recusa", (await motivoDe(() => agendarReuniao({ ...base, dia: ontem }))) === MOTIVO_DIA_PASSADO);
    check("hora 24:00 recusa", (await motivoDe(() => agendarReuniao({ ...base, horaInicio: "24:00" }))) !== null);
    check("link http recusa", (await motivoDe(() => agendarReuniao({ ...base, link: "http://x.com" }))) !== null);
    check("link javascript recusa", (await motivoDe(() => agendarReuniao({ ...base, link: "javascript:alert(1)" }))) !== null);
    const rA = await agendarReuniao(base);
    const noCliente = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "reuniao" && i.id === rA.id);
    check("a reunião vale na hora para o cliente", noCliente?.tipo === "reuniao" && noCliente.situacao === "agendada" && noCliente.horaInicio === "14:00" && noCliente.link === base.link);
    check("outro cliente não vê a reunião", !JSON.stringify(await agendaParaCliente(proj.id, contaB.id)).includes(rA.id));

    // Link gravado fora do caminho normal (seed, importação): o cliente nunca recebe um href perigoso.
    const perigosa = await prisma.reuniaoAgendada.create({ data: { projetoId: proj.id, titulo: "Link ruim", dia: d(mais(5)), horaInicio: "09:00", link: "javascript:alert(1)", criadaPorId: coordU.id } });
    const comLinkRuim = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "reuniao" && i.id === perigosa.id);
    check("link que não é https gravado direto no banco chega ao cliente como vazio", comLinkRuim?.tipo === "reuniao" && comLinkRuim.link === null);
    check("e não vai para o resumo diário", !(await itensDoResumoDaAgenda(proj.id)).some((i) => i.texto.includes("javascript")));

    // ── Remarcar e cancelar ──
    await editarReuniao({ ...base, id: rA.id, link: "https://meet.google.com/zzz-zzzz-zzz" });
    let linha = await prisma.reuniaoAgendada.findUniqueOrThrow({ where: { id: rA.id } });
    check("mudar só o link não remarca", linha.mudancaTipo === null && linha.diaAnterior === null);
    await editarReuniao({ ...base, id: rA.id, dia: mais(6), horaInicio: "15:30" });
    linha = await prisma.reuniaoAgendada.findUniqueOrThrow({ where: { id: rA.id } });
    check("mudar dia e hora remarca e guarda o anterior", linha.mudancaTipo === "remarcada" && diaIso(linha.diaAnterior) === mais(5) && linha.horaAnterior === "14:00" && diaIso(linha.mudancaEm) === hoje);
    const remarcada = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "reuniao" && i.id === rA.id);
    check("o cliente vê Remarcada com o dia e a hora de antes", remarcada?.tipo === "reuniao" && remarcada.situacao === "remarcada" && remarcada.diaAnterior === mais(5) && remarcada.horaAnterior === "14:00");

    const rB = await agendarReuniao({ ...base, titulo: "Corrida" });
    const corrida = await Promise.allSettled([
      editarReuniao({ ...base, id: rB.id, titulo: "Corrida editada", dia: mais(7) }),
      cancelarReuniao({ id: rB.id, motivo: "Cliente viajou", userId: coordU.id }),
    ]);
    const rejeicoes = corrida.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => (x.reason as Error).message);
    check("editar e cancelar ao mesmo tempo: nenhum é perdido em silêncio", corrida.some((x) => x.status === "fulfilled") && rejeicoes.every((m) => m === MOTIVO_REUNIAO_MUDOU || m === MOTIVO_REUNIAO_CANCELADA));
    const rC = await agendarReuniao({ ...base, titulo: "Cancelável" });
    await cancelarReuniao({ id: rC.id, motivo: "Cliente viajou", userId: coordU.id });
    const cancelada = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "reuniao" && i.id === rC.id);
    check("cancelada: o cliente lê a situação e o motivo", cancelada?.tipo === "reuniao" && cancelada.situacao === "cancelada" && cancelada.motivoCancelamento === "Cliente viajou");
    check("cancelada é final (editar e cancelar recusam)", (await motivoDe(() => editarReuniao({ ...base, id: rC.id }))) === MOTIVO_REUNIAO_CANCELADA && (await motivoDe(() => cancelarReuniao({ id: rC.id, motivo: null, userId: coordU.id }))) === MOTIVO_REUNIAO_CANCELADA);
    check("projetista não edita nem cancela", (await motivoDe(() => cancelarReuniao({ id: rA.id, motivo: null, userId: projetistaU.id }))) === MOTIVO_AGENDA_NAO_ENCONTRADA);

    // ── Reunião de dia passado e ata ligada ──
    const passada = await prisma.reuniaoAgendada.create({ data: { projetoId: proj.id, titulo: "Passada", dia: d(ontem), horaInicio: "10:00", criadaPorId: coordU.id } });
    check("reunião de dia passado não edita nem cancela", (await motivoDe(() => editarReuniao({ ...base, id: passada.id }))) === MOTIVO_REUNIAO_PASSADA && (await motivoDe(() => cancelarReuniao({ id: passada.id, motivo: null, userId: coordU.id }))) === MOTIVO_REUNIAO_PASSADA);
    const equipe = { userId: coordU.id, nome: coordU.name };
    const atasAntes = await prisma.reuniaoProjeto.count({ where: { projetoId: proj.id } });
    const doOutroProjeto = await prisma.reuniaoAgendada.create({ data: { projetoId: projRascunho.id, titulo: "De outro projeto", dia: d(ontem), horaInicio: "10:00", criadaPorId: coordU.id } });
    check(
      "agendadaId de reunião de outro projeto recusa e não deixa ata nem ligação",
      (await motivoDe(() => criarReuniaoComRascunho({ projetoId: proj.id, quem: equipe, texto: "Resumo\nTexto.", agendadaId: doOutroProjeto.id }))) === MOTIVO_NAO_ENCONTRADA &&
        (await prisma.reuniaoProjeto.count({ where: { projetoId: proj.id } })) === atasAntes &&
        (await prisma.reuniaoAgendada.findUniqueOrThrow({ where: { id: doOutroProjeto.id } })).reuniaoId === null,
    );
    check(
      "importar ata antes do dia da reunião recusa e não deixa ata",
      (await motivoDe(() => criarReuniaoComRascunho({ projetoId: proj.id, quem: equipe, texto: "Resumo\nTexto.", agendadaId: rA.id }))) === MOTIVO_ATA_ANTES_DO_DIA &&
        (await prisma.reuniaoProjeto.count({ where: { projetoId: proj.id } })) === atasAntes,
    );
    check("importar ata de reunião cancelada recusa", (await motivoDe(() => criarReuniaoComRascunho({ projetoId: proj.id, quem: equipe, texto: "Resumo\nTexto.", agendadaId: rC.id }))) === MOTIVO_REUNIAO_CANCELADA);
    const duas = await Promise.allSettled([
      criarReuniaoComRascunho({ projetoId: proj.id, quem: equipe, texto: "Resumo\nTexto um.", agendadaId: passada.id }),
      criarReuniaoComRascunho({ projetoId: proj.id, quem: equipe, texto: "Resumo\nTexto dois.", agendadaId: passada.id }),
    ]);
    check(
      "duas atas ao mesmo tempo para a mesma reunião: uma vence, a outra desfaz tudo",
      duas.filter((x) => x.status === "fulfilled").length === 1 &&
        duas.some((x) => x.status === "rejected" && (x.reason as Error).message === MOTIVO_JA_TEM_ATA) &&
        (await prisma.reuniaoProjeto.count({ where: { projetoId: proj.id } })) === atasAntes + 1,
    );
    const ligada = await prisma.reuniaoAgendada.findUniqueOrThrow({ where: { id: passada.id } });
    const ata = await prisma.reuniaoProjeto.findUniqueOrThrow({ where: { id: ligada.reuniaoId! } });
    check("a ata nasce ligada à reunião, com o título e o dia dela", ata.titulo === "Passada" && diaIso(ata.data) === ontem);
    check("segunda ata para a mesma reunião recusa", (await motivoDe(() => criarReuniaoComRascunho({ projetoId: proj.id, quem: equipe, texto: "Resumo\nTexto três.", agendadaId: passada.id }))) === MOTIVO_JA_TEM_ATA);
    const semPublicar = (await agendaParaEquipe(proj.id, coordU.id))!.reunioes.find((r) => r.id === passada.id);
    check("rascunho de ata ainda não é 'Ver ata'", semPublicar?.temAta === false && semPublicar.situacao === "realizada");
    const versao = await prisma.ataVersao.findFirstOrThrow({ where: { reuniaoId: ata.id } });
    await publicar({ versaoId: versao.id, quem: equipe });
    const comAta = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "reuniao" && i.id === passada.id);
    check("ata publicada: o cliente ganha o atalho Ver ata", comAta?.tipo === "reuniao" && comAta.temAta === true && comAta.passado === true);
    await retirarAta({ reuniaoId: ata.id, quem: equipe, motivo: "Publicada por engano" });
    const semAta = (await agendaParaCliente(proj.id, joana.id))!.find((i) => i.tipo === "reuniao" && i.id === passada.id);
    check("ata retirada: o atalho some", semAta?.tipo === "reuniao" && semAta.temAta === false);

    // ── Conferência da previsão ──
    const vista = async (id: string) => diaIso((await prisma.marcoAgendaPortal.findUnique({ where: { marcoId: id } }))?.previsaoVista ?? null);
    const mover = (id: string, fim: string) => prisma.eapTarefa.update({ where: { id }, data: { fimPrevisto: d(fim), inicioPrevisto: d(fim) } });
    const primeira = await conferirPrevisoes(proj.id, ontem);
    check("primeira conferência só grava o valor visto, sem avisar", primeira.alteradas === 0 && primeira.gravadas >= 2 && (await vista(m2.id)) === mais(8) && (await vista(m3.id)) === null);
    await mover(m4.id, mais(45));
    await mover(m4.id, mais(40));
    check("mudou e voltou ao mesmo valor antes da rodada: nada", (await conferirPrevisoes(proj.id, ontem)).alteradas === 0);
    await mover(m2.id, mais(12));
    const duasRodadas = await Promise.all([conferirPrevisoes(proj.id, ontem), conferirPrevisoes(proj.id, ontem)]);
    const alterou = { alteradas: duasRodadas[0].alteradas + duasRodadas[1].alteradas };
    const l2 =await prisma.marcoAgendaPortal.findUniqueOrThrow({ where: { marcoId: m2.id } });
    check("previsão mudou (duas rodadas ao mesmo tempo): grava uma vez só, de → para e o dia (ontem)", alterou.alteradas === 1 && diaIso(l2.previsaoAnterior) === mais(8) && diaIso(l2.previsaoVista) === mais(12) && diaIso(l2.previsaoAlteradaEm) === ontem);
    check("repetir a conferência sem mudança não grava de novo", (await conferirPrevisoes(proj.id, "2000-01-01")).alteradas === 0 && diaIso((await prisma.marcoAgendaPortal.findUniqueOrThrow({ where: { marcoId: m2.id } })).previsaoAlteradaEm) === ontem);
    await prisma.cronogramaProjeto.update({ where: { projetoId: proj.id }, data: { emRevisao: true } });
    await mover(m2.id, mais(20));
    const emRevisao = await conferirPrevisoes(proj.id, ontem);
    check("cronograma em revisão: não confere nem avisa", emRevisao.alteradas === 0 && (await vista(m2.id)) === mais(12));
    await prisma.cronogramaProjeto.update({ where: { projetoId: proj.id }, data: { emRevisao: false } });
    await mover(m2.id, mais(8));
    const adiantou = await conferirPrevisoes(proj.id, ontem);
    const l2b = await prisma.marcoAgendaPortal.findUniqueOrThrow({ where: { marcoId: m2.id } });
    check("adiantar também avisa (a diferença líquida desde a última conferência)", adiantou.alteradas === 1 && diaIso(l2b.previsaoAnterior) === mais(12) && diaIso(l2b.previsaoVista) === mais(8));
    const entregue = await conferirPrevisoes(proj.id, ontem);
    check("marco entregue nunca é conferido", entregue.gravadas === 0 && (await vista(m3.id)) === null);

    // ── Resumo diário ──
    await mover(m1.id, mais(37)); // alterada na rodada (era 30)
    await agendarReuniao({ ...base, titulo: "Reunião *do dia*", dia: mais(3), local: "Sala [A]" });
    const rQ = await agendarReuniao({ ...base, titulo: "Lembrete certo", dia: mais(2) });
    await prisma.reuniaoAgendada.update({ where: { id: rQ.id }, data: { criadaEm: new Date(Date.now() - 4 * 86_400_000) } });
    const rR = await agendarReuniao({ ...base, titulo: "Cancelada depois", dia: mais(9) });
    await prisma.reuniaoAgendada.update({ where: { id: rR.id }, data: { criadaEm: new Date(Date.now() - 4 * 86_400_000) } });
    await cancelarReuniao({ id: rR.id, motivo: "Mudança de agenda", userId: coordU.id });
    const rS = await agendarReuniao({ ...base, titulo: "Criada e cancelada hoje", dia: mais(9) });
    await cancelarReuniao({ id: rS.id, motivo: null, userId: coordU.id });

    const itens = await itensDoResumoDaAgenda(proj.id);
    const textos = itens.map((i) => i.texto).join("\n");
    check("itens do resumo: marco próximo (m2, 8 dias), sem contar dias no texto", itens.some((i) => i.dia === hoje && i.texto.includes("entrega prevista para")) && !/em \d+ dias/.test(textos));
    check("itens do resumo: lembrete e reunião cancelada com motivo", textos.includes("Lembrete: Lembrete certo") && textos.includes("Reunião cancelada: Cancelada depois") && textos.includes("Motivo: Mudança de agenda"));
    check("criada e cancelada no mesmo dia não gera aviso", !textos.includes("Criada e cancelada hoje"));

    const emails: { para: string; lista: string }[] = [];
    const sinos: { userId: string; corpo: string }[] = [];
    await salvarConfigResumo({ ativo: true, desde: hoje, ultimoDia: ontem });
    const rodar = () =>
      rodarResumoDiario({
        hoje: amanha,
        enviar: async (para, vars) => {
          emails.push({ para, lista: vars.lista });
          return true;
        },
        notificar: async (userId, n) => void sinos.push({ userId, corpo: n.corpo }),
        somenteProjetos: [proj.id],
      });
    const r1 = await rodar();
    const lista = emails[0]?.lista ?? "";
    check("a rodada manda 1 e-mail e 1 sino à conta do cliente", r1.emails === 1 && r1.sinos === 1 && emails[0]?.para === joana.email && sinos[0]?.userId === joana.id);
    check("e-mail: previsão alterada com o combinado e a nota escapada", lista.includes("previsão alterada de") && lista.includes("(combinado:") && lista.includes("Aguardando \\*aprovação\\* do cliente"));
    check("e-mail: reunião agendada com título e local escapados", lista.includes("Reunião agendada: Reunião \\*do dia\\*") && lista.includes("Local: Sala \\[A\\]"));
    check("a rodada gravou a previsão alterada do m1 (de 30 para 37)", diaIso((await prisma.marcoAgendaPortal.findUniqueOrThrow({ where: { marcoId: m1.id } })).previsaoAnterior) === mais(30));
    const r2 = await rodar();
    check("segunda rodada no mesmo dia não manda nada (dia avaliado uma vez)", r2.emails === 0 && r2.sinos === 0 && emails.length === 1);
  } finally {
    const remover = async (rotulo: string, id: string, apagar: () => Promise<unknown>) => {
      try {
        await apagar();
      } catch (e) {
        console.error(`[limpeza] não removeu ${rotulo} ${id}:`, e);
      }
    };
    for (const id of contratos) await remover("contrato", id, () => prisma.documentoJuridico.deleteMany({ where: { id } }));
    for (const id of projetos) await remover("projeto", id, () => prisma.projeto.delete({ where: { id } }));
    for (const id of usuarios) await remover("usuário", id, () => prisma.user.delete({ where: { id } }));
    for (const id of clientes) await remover("cliente", id, () => prisma.cliente.delete({ where: { id } }));
    await remover("configuração do resumo", CHAVE_CONFIG_RESUMO, async () => {
      if (configAntes) await prisma.configSistema.update({ where: { chave: CHAVE_CONFIG_RESUMO }, data: { valor: configAntes.valor as Prisma.InputJsonValue } });
      else await prisma.configSistema.deleteMany({ where: { chave: CHAVE_CONFIG_RESUMO } });
    });
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
