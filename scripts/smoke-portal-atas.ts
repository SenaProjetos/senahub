/**
 * Smoke das atas de reunião no portal (spec docs/superpowers/specs/2026-11-22-portal-atas-reuniao-design.md) contra o
 * banco de dev, sem o servidor no ar.
 *
 * Cenário próprio (clientes, projetos, contas e internos com sufixo do smoke), apagado no fim. Usa a amostra SINTÉTICA
 * `src/modules/portal/atas/__amostras__/formato-novo.md`.
 *
 * Confere: importar (itens sugeridos), quem pode; publicar (responsável, Tarefas e pendências); corrigir (mesmas chaves);
 * versão 2 só aplica o que mudou (edição manual na Tarefa sobrevive), remove (arquiva/cancela), traz de volta
 * (desarquiva/reabre, mesma linha); responder (substituída, corrida, outro cliente/inativo, observação obrigatória);
 * pendência (feito, conferir × reabrir, reabrir com motivo, atrasada); retirar; descartar o rascunho da 1ª versão.
 *
 * Uso: npm run smoke:portal-atas
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { resolverCaminho, salvarArquivo } from "../src/lib/storage";
import { textoDoArquivo } from "../src/modules/portal/atas/docx";
import { atasParaCliente, atasParaEquipe } from "../src/modules/portal/atas/queries";
import { avisarPendenciaFeita, avisarPendenciaReaberta, avisarPublicacao, avisarRespostaAta, avisarTarefasNovas, type DepsAvisos } from "../src/modules/portal/atas/avisos";
import { conversaParaCliente } from "../src/modules/portal/mensagens/queries";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { TERMOS, tipoTermoPorTipo } from "../src/modules/legal/termos";
import {
  arquivoParaEquipe,
  conferirPendencia,
  corrigirAta,
  criarReuniaoComRascunho,
  descartarRascunho,
  marcarPendenciaFeita,
  publicar,
  reabrirPendencia,
  registrarArquivosDaAta,
  responderAta,
  retirarAta,
  salvarRascunho,
  type Equipe,
} from "../src/modules/portal/atas/service";
import {
  MOTIVO_JA_RESPONDIDA,
  MOTIVO_MOTIVO_REABRIR,
  MOTIVO_NAO_ENCONTRADA,
  MOTIVO_OBSERVACAO,
  MOTIVO_PENDENCIA_ESTADO,
  MOTIVO_PENDENCIA_NAO_ENCONTRADA,
  MOTIVO_RESPONSAVEL_FORA,
  MOTIVO_RETIRADA,
  MOTIVO_SEM_RESPONSAVEL,
  MOTIVO_SUBSTITUIDA,
  pendenciaAtrasada,
  type ItemRascunho,
} from "../src/modules/portal/atas/regras";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function main() {
  const tag = `SMKATAS_${Date.now()}`;
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
  const clientes: string[] = [];
  const projetos: string[] = [];
  const usuarios: string[] = [];
  const tarefasCriadas: string[] = [];

  try {
    const novoCliente = async (sufixo: string, ativo = true) => {
      const c = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_${sufixo}`, ativo } });
      clientes.push(c.id);
      return c;
    };
    const novoProjeto = async (clienteId: string, sufixo: string) => {
      const p = await prisma.$transaction(async (tx) => {
        const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
        return tx.projeto.create({ data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${sufixo}`, clienteId } });
      });
      projetos.push(p.id);
      return p;
    };
    const tipoTermo = tipoTermoPorTipo("externo");
    const novaConta = async (clienteId: string, nome: string, sufixo: string) => {
      const u = await prisma.user.create({ data: { name: nome, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "externo", clienteId } });
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

    const cliA = await novoCliente("cliA");
    const cliB = await novoCliente("cliB");
    const cliInativo = await novoCliente("inativo", false);
    const proj = await novoProjeto(cliA.id, "P");
    const projInativo = await novoProjeto(cliInativo.id, "I");
    const joana = await novaConta(cliA.id, "Joana Prado", "joana");
    const outraConta = await novaConta(cliA.id, "Marcos Lima", "marcos");
    const contaB = await novaConta(cliB.id, "Bia Souza", "bia");
    const contaInativo = await novaConta(cliInativo.id, "Inês Inativa", "ines");
    const coordU = await novoInterno("Carlos Mendes", "coord");
    const projetistaU = await novoInterno("Pedro Projetista", "projetista");
    const foraU = await novoInterno("Fora do Projeto", "fora");
    await prisma.projetoMembro.create({ data: { projetoId: proj.id, userId: coordU.id, papel: "coordenador" } });
    await prisma.projetoMembro.create({ data: { projetoId: proj.id, userId: projetistaU.id, papel: "projetista" } });
    await prisma.projetoMembro.create({ data: { projetoId: projInativo.id, userId: coordU.id, papel: "coordenador" } });
    const coord: Equipe = { userId: coordU.id, nome: coordU.name };
    const projetista: Equipe = { userId: projetistaU.id, nome: projetistaU.name };
    const cJoana = { userId: joana.id, nome: joana.name };
    const cMarcos = { userId: outraConta.id, nome: outraConta.name };

    const amostra = readFileSync("src/modules/portal/atas/__amostras__/formato-novo.md", "utf8");

    // ── Importar ──
    check("projetista não importa", (await motivoDe(() => criarReuniaoComRascunho({ projetoId: proj.id, quem: projetista, texto: amostra }))) === MOTIVO_NAO_ENCONTRADA);
    const r1 = await criarReuniaoComRascunho({ projetoId: proj.id, quem: coord, texto: amostra });
    const reuniao = await prisma.reuniaoProjeto.findUniqueOrThrow({ where: { id: r1.reuniaoId } });
    const itens0 = await prisma.ataItem.findMany({ where: { versaoId: r1.versaoId }, orderBy: { ordem: "asc" } });
    const porTitulo = (t: string) => itens0.find((i) => i.titulo === t);
    check("data e título padrão do cabeçalho", dia(reuniao.data) === "2026-11-04" && reuniao.titulo === "Reunião de 04/11/2026");
    check("decisões importadas", itens0.filter((i) => i.tipo === "decisao").length === 3);
    check("Joana (conta do cliente) vira pendência do cliente", porTitulo("Enviar levantamento topográfico")?.tipo === "pendencia_cliente");
    check("Carlos (membro) vira tarefa com ele", porTitulo("Ajustar cobertura")?.tipo === "tarefa_equipe" && porTitulo("Ajustar cobertura")?.responsavelId === coordU.id);
    check("SENA Engenharia vira tarefa sem responsável", porTitulo("Revisar fachada")?.tipo === "tarefa_equipe" && porTitulo("Revisar fachada")?.responsavelId === null);

    const paraRascunho = (lista: typeof itens0): ItemRascunho[] =>
      lista.map((i) => ({ chave: i.chave, tipo: i.tipo, titulo: i.titulo, descricao: i.descricao, responsavelId: i.responsavelId, prazo: dia(i.prazo) }));
    let itens = paraRascunho(itens0);
    check("publicar com tarefa sem responsável recusa", (await motivoDe(() => publicar({ versaoId: r1.versaoId, quem: coord }))) === MOTIVO_SEM_RESPONSAVEL);
    itens = itens.map((i) => (i.tipo === "tarefa_equipe" && !i.responsavelId ? { ...i, responsavelId: foraU.id } : i));
    await salvarRascunho({ versaoId: r1.versaoId, quem: coord, texto: "Resumo revisado.", itens, titulo: "Reunião de alinhamento", data: "2026-11-04" });
    check("responsável fora dos membros recusa", (await motivoDe(() => publicar({ versaoId: r1.versaoId, quem: coord }))) === MOTIVO_RESPONSAVEL_FORA);
    // Agenda visita = pendência com prazo vencido (para conferir "atrasada").
    itens = itens.map((i) =>
      i.titulo === "Agendar visita"
        ? { ...i, tipo: "pendencia_cliente", responsavelId: null, prazo: "2026-01-05" }
        : i.tipo === "tarefa_equipe" && i.responsavelId === foraU.id
          ? { ...i, responsavelId: projetistaU.id }
          : i,
    );
    await salvarRascunho({ versaoId: r1.versaoId, quem: coord, texto: "Resumo revisado.", itens, titulo: "Reunião de alinhamento", data: "2026-11-04" });
    const chaveForjada = await motivoDe(() =>
      salvarRascunho({ versaoId: r1.versaoId, quem: coord, texto: "x", itens: [{ ...itens[0], chave: "chave-de-outra-reuniao" }], titulo: "Reunião de alinhamento", data: "2026-11-04" }),
    );
    const chavesDepois = (await prisma.ataItem.findMany({ where: { versaoId: r1.versaoId } })).map((i) => i.chave);
    check("chave desconhecida vinda da tela ganha chave nova", chaveForjada === null && !chavesDepois.includes("chave-de-outra-reuniao"));
    await salvarRascunho({ versaoId: r1.versaoId, quem: coord, texto: "Resumo revisado.", itens, titulo: "Reunião de alinhamento", data: "2026-11-04" });
    const itensV1 = await prisma.ataItem.findMany({ where: { versaoId: r1.versaoId } });
    itens = paraRascunho(itensV1);

    // ── Publicar ──
    const pub1 = await publicar({ versaoId: r1.versaoId, quem: coord });
    const ligacoes = await prisma.tarefaDaAta.findMany({ where: { reuniaoId: r1.reuniaoId } });
    tarefasCriadas.push(...ligacoes.map((l) => l.tarefaId));
    const tarefas = await prisma.tarefa.findMany({ where: { id: { in: ligacoes.map((l) => l.tarefaId) } }, include: { responsaveis: true } });
    const pendencias = await prisma.pendenciaCliente.findMany({ where: { reuniaoId: r1.reuniaoId } });
    check(
      "publicar cria 2 Tarefas (projeto, criador, responsável, origem) e 2 pendências abertas",
      tarefas.length === 2 && pub1.tarefasNovas.length === 2 &&
        tarefas.every((t) => t.projetoId === proj.id && t.criadorId === coordU.id && t.responsaveis.length === 1 && (t.descricao ?? "").includes("Origem: ata de 04/11/2026")) &&
        pendencias.length === 2 && pendencias.every((p) => p.situacao === "aberta"),
    );
    const v1 = await prisma.ataVersao.findUniqueOrThrow({ where: { id: r1.versaoId } });
    check("versão 1 publicada", v1.estado === "publicada" && v1.publicadaPorId === coordU.id);

    // ── Corrigir (v2) ──
    const v2 = await corrigirAta({ reuniaoId: r1.reuniaoId, quem: coord });
    const itensV2 = await prisma.ataItem.findMany({ where: { versaoId: v2.versaoId } });
    check("corrigir copia os itens com as mesmas chaves", itensV2.map((i) => i.chave).sort().join() === itensV1.map((i) => i.chave).sort().join());
    check("segundo rascunho recusa", (await motivoDe(() => corrigirAta({ reuniaoId: r1.reuniaoId, quem: coord }))) !== null);

    // Edição à mão no quadro de Tarefas: prazo da tarefa "Ajustar cobertura".
    const chaveCobertura = itensV1.find((i) => i.titulo === "Ajustar cobertura")!.chave;
    const tCobertura = ligacoes.find((l) => l.chave === chaveCobertura)!.tarefaId;
    await prisma.tarefa.update({ where: { id: tCobertura }, data: { prazo: new Date("2027-03-01T00:00:00.000Z") } });
    const chaveFachada = itensV1.find((i) => i.titulo === "Revisar fachada")!.chave;
    const chaveTopo = itensV1.find((i) => i.titulo === "Enviar levantamento topográfico")!.chave;
    let itens2 = paraRascunho(itensV2)
      .map((i) => (i.chave === chaveCobertura ? { ...i, titulo: "Ajustar cobertura (telha termoacústica)" } : i))
      .filter((i) => i.chave !== chaveFachada && i.chave !== chaveTopo);
    await salvarRascunho({ versaoId: v2.versaoId, quem: coord, texto: "Resumo revisado v2.", itens: itens2, titulo: "Reunião de alinhamento", data: "2026-11-04" });
    await publicar({ versaoId: v2.versaoId, quem: coord });
    const tCob = await prisma.tarefa.findUniqueOrThrow({ where: { id: tCobertura } });
    check("v2: título atualizado, prazo manual mantido", tCob.titulo === "Ajustar cobertura (telha termoacústica)" && dia(tCob.prazo) === "2027-03-01");
    const tFach = await prisma.tarefa.findUniqueOrThrow({ where: { id: ligacoes.find((l) => l.chave === chaveFachada)!.tarefaId } });
    const pTopo = await prisma.pendenciaCliente.findUniqueOrThrow({ where: { chave: chaveTopo } });
    check("v2: item removido arquiva Tarefa e cancela pendência", tFach.arquivada === true && pTopo.situacao === "cancelada");
    check("v2: nada duplicado", (await prisma.tarefaDaAta.count({ where: { reuniaoId: r1.reuniaoId } })) === 2 && (await prisma.pendenciaCliente.count({ where: { reuniaoId: r1.reuniaoId } })) === 2);
    check("v1 substituída", (await prisma.ataVersao.findUniqueOrThrow({ where: { id: r1.versaoId } })).estado === "substituida");

    // ── Responder ──
    check("responder v1 depois da v2 = substituída", (await motivoDe(() => responderAta({ versaoId: r1.versaoId, conta: cJoana, resposta: "concorda", observacao: null }))) === MOTIVO_SUBSTITUIDA);
    check("observações sem texto recusa", (await motivoDe(() => responderAta({ versaoId: v2.versaoId, conta: cJoana, resposta: "observacoes", observacao: "  " }))) === MOTIVO_OBSERVACAO);
    check("outro cliente recusa", (await motivoDe(() => responderAta({ versaoId: v2.versaoId, conta: { userId: contaB.id, nome: contaB.name }, resposta: "concorda", observacao: null }))) === MOTIVO_NAO_ENCONTRADA);
    const corrida = await Promise.allSettled([
      responderAta({ versaoId: v2.versaoId, conta: cJoana, resposta: "observacoes", observacao: "A visita é dia 10, não 12." }),
      responderAta({ versaoId: v2.versaoId, conta: cMarcos, resposta: "concorda", observacao: null }),
    ]);
    check(
      "duas contas ao mesmo tempo = uma resposta",
      corrida.filter((x) => x.status === "fulfilled").length === 1 &&
        corrida.some((x) => x.status === "rejected" && (x.reason as Error).message === MOTIVO_JA_RESPONDIDA),
    );

    // ── v3 traz de volta ──
    const v3 = await corrigirAta({ reuniaoId: r1.reuniaoId, quem: coord });
    itens2 = paraRascunho(await prisma.ataItem.findMany({ where: { versaoId: v3.versaoId } }));
    const volta = itensV1.filter((i) => i.chave === chaveFachada || i.chave === chaveTopo);
    const itens3 = [...itens2, ...paraRascunho(volta)];
    await salvarRascunho({ versaoId: v3.versaoId, quem: coord, texto: "Resumo v3.", itens: itens3, titulo: "Reunião de alinhamento", data: "2026-11-04" });
    await publicar({ versaoId: v3.versaoId, quem: coord });
    const tFach3 = await prisma.tarefa.findUniqueOrThrow({ where: { id: tFach.id } });
    const pTopo3 = await prisma.pendenciaCliente.findUniqueOrThrow({ where: { chave: chaveTopo } });
    check("v3: item de volta desarquiva a mesma Tarefa e reabre a mesma pendência", tFach3.arquivada === false && pTopo3.id === pTopo.id && pTopo3.situacao === "aberta");
    check("v3: ainda sem duplicar", (await prisma.tarefaDaAta.count({ where: { reuniaoId: r1.reuniaoId } })) === 2);

    // Ciclo: feita → removida (cancelada) → volta: aberta e limpa.
    await marcarPendenciaFeita({ pendenciaId: pTopo3.id, conta: cJoana, comentario: "Já mandei." });
    const v4 = await corrigirAta({ reuniaoId: r1.reuniaoId, quem: coord });
    const itens4 = paraRascunho(await prisma.ataItem.findMany({ where: { versaoId: v4.versaoId } }));
    await salvarRascunho({ versaoId: v4.versaoId, quem: coord, texto: "v4", itens: itens4.filter((i) => i.chave !== chaveTopo && i.chave !== chaveCobertura), titulo: "Reunião de alinhamento", data: "2026-11-04" });
    await publicar({ versaoId: v4.versaoId, quem: coord });
    // A Tarefa da cobertura é apagada à mão no quadro (não arquivada).
    await prisma.tarefa.delete({ where: { id: tCobertura } });
    const v5 = await corrigirAta({ reuniaoId: r1.reuniaoId, quem: coord });
    const itens5 = paraRascunho(await prisma.ataItem.findMany({ where: { versaoId: v5.versaoId } }));
    const devolta = paraRascunho(itensV1.filter((i) => i.chave === chaveTopo || i.chave === chaveCobertura));
    await salvarRascunho({ versaoId: v5.versaoId, quem: coord, texto: "v5", itens: [...itens5, ...devolta], titulo: "Reunião de alinhamento", data: "2026-11-04" });
    await publicar({ versaoId: v5.versaoId, quem: coord });
    const pTopo5 = await prisma.pendenciaCliente.findUniqueOrThrow({ where: { chave: chaveTopo } });
    check("pendência que volta vem aberta, sem o 'feito' da volta anterior", pTopo5.situacao === "aberta" && pTopo5.feitaEm === null && pTopo5.comentarioFeito === null);
    const lig5 = await prisma.tarefaDaAta.findUniqueOrThrow({ where: { chave: chaveCobertura } });
    tarefasCriadas.push(lig5.tarefaId);
    check("Tarefa apagada à mão é recriada quando o item volta", lig5.tarefaId !== tCobertura && (await prisma.tarefa.count({ where: { id: lig5.tarefaId } })) === 1);

    // ── Pendências ──
    const pVisita = await prisma.pendenciaCliente.findFirstOrThrow({ where: { reuniaoId: r1.reuniaoId, titulo: "Agendar visita" } });
    check("pendência vencida é atrasada", pendenciaAtrasada({ situacao: pVisita.situacao, prazo: dia(pVisita.prazo) }, "2026-11-22"));
    check("outro cliente não marca feito", (await motivoDe(() => marcarPendenciaFeita({ pendenciaId: pVisita.id, conta: { userId: contaB.id, nome: contaB.name }, comentario: null }))) === MOTIVO_PENDENCIA_NAO_ENCONTRADA);
    await marcarPendenciaFeita({ pendenciaId: pVisita.id, conta: cJoana, comentario: "Visita marcada para dia 10." });
    check("feito de novo recusa", (await motivoDe(() => marcarPendenciaFeita({ pendenciaId: pVisita.id, conta: cMarcos, comentario: null }))) === MOTIVO_PENDENCIA_ESTADO.aguardando_conferencia);
    check("projetista não confere", (await motivoDe(() => conferirPendencia({ pendenciaId: pVisita.id, quem: projetista }))) === MOTIVO_PENDENCIA_NAO_ENCONTRADA);
    check("reabrir sem motivo recusa", (await motivoDe(() => reabrirPendencia({ pendenciaId: pVisita.id, quem: coord, motivo: " " }))) === MOTIVO_MOTIVO_REABRIR);
    const corridaP = await Promise.allSettled([
      conferirPendencia({ pendenciaId: pVisita.id, quem: coord }),
      reabrirPendencia({ pendenciaId: pVisita.id, quem: coord, motivo: "Faltou o horário." }),
    ]);
    const depois = await prisma.pendenciaCliente.findUniqueOrThrow({ where: { id: pVisita.id } });
    check(
      "conferir × reabrir ao mesmo tempo = um",
      corridaP.filter((x) => x.status === "fulfilled").length === 1 && (depois.situacao === "conferida" || depois.situacao === "reaberta"),
    );
    if (depois.situacao === "reaberta") {
      await marcarPendenciaFeita({ pendenciaId: pVisita.id, conta: cMarcos, comentario: "Às 9h." });
      check("reaberta volta a aguardar conferência", (await prisma.pendenciaCliente.findUniqueOrThrow({ where: { id: pVisita.id } })).situacao === "aguardando_conferencia");
    } else {
      check("conferida não aceita feito", (await motivoDe(() => marcarPendenciaFeita({ pendenciaId: pVisita.id, conta: cMarcos, comentario: null }))) === MOTIVO_PENDENCIA_ESTADO.conferida);
    }

    // ── Leituras e avisos ──
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
    };
    const limpar = () => {
      sinos.length = 0;
      emails.length = 0;
    };
    const sinosDe = (id: string) => sinos.filter((x) => x.userId === id);
    const vigente = await prisma.ataVersao.findFirstOrThrow({ where: { reuniaoId: r1.reuniaoId, estado: "publicada" } });
    limpar();
    await avisarPublicacao(vigente.id, deps);
    check(
      "publicação: 1 sino + 1 e-mail por conta ativa, nada a outro cliente",
      sinosDe(joana.id).length === 1 && sinosDe(outraConta.id).length === 1 && sinosDe(contaB.id).length === 0 &&
        emails.filter((e) => e.slug === "portal-ata-reuniao").length === 2 && sinos.every((x) => x.categoria === null),
    );
    limpar();
    await avisarPublicacao(vigente.id, { ...deps, enviarEmail: null });
    check("publicação sem SMTP: só sinos", sinos.length === 2 && emails.length === 0);
    await responderAta({ versaoId: vigente.id, conta: cJoana, resposta: "concorda", observacao: null });
    limpar();
    await avisarRespostaAta(vigente.id, deps);
    check("resposta: sino ao coordenador (não ao projetista), categoria ata_reuniao", sinosDe(coordU.id).length === 1 && sinosDe(projetistaU.id).length === 0 && sinos.every((x) => x.categoria === "ata_reuniao"));
    const pTopoAberta = await prisma.pendenciaCliente.findUniqueOrThrow({ where: { chave: chaveTopo } });
    await marcarPendenciaFeita({ pendenciaId: pTopoAberta.id, conta: cJoana, comentario: null });
    limpar();
    await avisarPendenciaFeita(pTopoAberta.id, deps);
    check("pendência feita: sino ao coordenador", sinosDe(coordU.id).length === 1 && sinos[0]?.categoria === "ata_reuniao");
    await reabrirPendencia({ pendenciaId: pTopoAberta.id, quem: coord, motivo: "Faltou a planta." });
    limpar();
    await avisarPendenciaReaberta(pTopoAberta.id, deps);
    check("reabertura: sino às contas do cliente", sinosDe(joana.id).length === 1 && sinosDe(outraConta.id).length === 1 && sinosDe(coordU.id).length === 0);
    limpar();
    await avisarTarefasNovas([{ tarefaId: "t", responsavelId: projetistaU.id, titulo: "X" }], deps);
    check("tarefa nova: sino ao responsável", sinosDe(projetistaU.id).length === 1 && sinos[0]?.titulo === "Nova tarefa atribuída");

    const doCliente = await atasParaCliente(proj.id, joana.id);
    const daEquipe = await atasParaEquipe(proj.id, coordU.id);
    const rc = doCliente?.reunioes.find((x) => x.id === r1.reuniaoId);
    check(
      "cliente: sem rascunho, sem nomes internos, sem responsável da tarefa",
      !!rc && rc.rascunho === null && rc.vigente?.publicadaPorNome === null && rc.arquivos.length === 0 && rc.retirada === null &&
        rc.vigente.itens.every((i) => i.responsavelId === null && i.responsavelNome === null),
    );
    check(
      "cliente: tarefa da equipe sem descrição interna; pendência com descrição",
      !!rc && rc.vigente!.itens.filter((i) => i.tipo === "tarefa_equipe").every((i) => i.descricao === null) &&
        rc.vigente!.itens.some((i) => i.tipo === "pendencia_cliente" && i.descricao !== null),
    );
    check("decisões das atas trazem a chave (lista sem chave repetida)", (await conversaParaCliente(proj.id, joana.id))!.decisoesDeAtas.every((d) => typeof d.chave === "string" && d.chave.length > 0));
    check("cliente: pendência reaberta traz o motivo", doCliente?.pendencias.find((x) => x.id === pTopoAberta.id)?.motivoReabertura === "Faltou a planta.");
    check("cliente: pendência cancelada não aparece", !(doCliente?.pendencias ?? []).some((x) => x.situacao === "cancelada"));
    check("equipe: vê responsável e quem publicou", !!daEquipe && daEquipe.reunioes[0].vigente?.publicadaPorNome === coord.nome && daEquipe.reunioes[0].vigente.itens.some((i) => i.responsavelNome !== null));
    check("projetista: leitura da equipe = null", (await atasParaEquipe(proj.id, projetistaU.id)) === null);
    check("outro cliente: leitura do cliente = null", (await atasParaCliente(proj.id, contaB.id)) === null);
    const conversa = await conversaParaCliente(proj.id, joana.id);
    check("Decisões do portal trazem as da ata vigente", (conversa?.decisoesDeAtas ?? []).some((d) => d.titulo === "Telha termoacústica na cobertura" && d.reuniaoId === r1.reuniaoId));

    // ── Retirar ──
    await retirarAta({ reuniaoId: r1.reuniaoId, quem: coord, motivo: "Publicada no projeto errado." });
    const ret = await prisma.reuniaoProjeto.findUniqueOrThrow({ where: { id: r1.reuniaoId } });
    const tRet = await prisma.tarefa.findMany({ where: { id: { in: tarefasCriadas } } });
    const pRet = await prisma.pendenciaCliente.findMany({ where: { reuniaoId: r1.reuniaoId } });
    check("retirar grava quem e motivo", ret.retiradaEm !== null && ret.retiradaPorId === coordU.id && ret.motivoRetirada === "Publicada no projeto errado.");
    check("retirar arquiva as Tarefas abertas", tRet.every((t) => t.arquivada || t.concluidaEm !== null));
    check("retirar cancela as pendências não conferidas", pRet.every((p) => p.situacao === "cancelada" || p.situacao === "conferida"));
    const v3pub = await prisma.ataVersao.findFirstOrThrow({ where: { reuniaoId: r1.reuniaoId, estado: "publicada" } });
    check("responder ata retirada recusa", (await motivoDe(() => responderAta({ versaoId: v3pub.id, conta: cJoana, resposta: "concorda", observacao: null }))) === MOTIVO_RETIRADA);
    check("retirada some do portal e das Decisões", !((await atasParaCliente(proj.id, joana.id))?.reunioes ?? []).some((x) => x.id === r1.reuniaoId) && !((await conversaParaCliente(proj.id, joana.id))?.decisoesDeAtas ?? []).some((d) => d.reuniaoId === r1.reuniaoId));
    check("retirada: pendências fora do portal", !((await atasParaCliente(proj.id, joana.id))?.pendencias ?? []).some((x) => x.reuniaoId === r1.reuniaoId));
    check("retirar de novo recusa", (await motivoDe(() => retirarAta({ reuniaoId: r1.reuniaoId, quem: coord, motivo: "x" }))) === MOTIVO_RETIRADA);

    // ── Arquivos (importar por .docx) ──
    const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
      "19 de jan. de 2026",
      "Reunião - Clube Exemplo",
      "Resumo",
      "Alinhamento do anteprojeto.",
      "Próximas etapas sugeridas",
    ].map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("")}<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Joana Prado vai enviar o programa de necessidades.</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(xml) });
    const rArq = await criarReuniaoComRascunho({ projetoId: proj.id, quem: coord, texto: textoDoArquivo("ata.docx", docx) });
    const reArq = await prisma.reuniaoProjeto.findUniqueOrThrow({ where: { id: rArq.reuniaoId } });
    const itArq = await prisma.ataItem.findMany({ where: { versaoId: rArq.versaoId } });
    check("docx: título, data e pendência da Joana", reArq.titulo === "Reunião - Clube Exemplo" && dia(reArq.data) === "2026-01-19" && itArq.length === 1 && itArq[0].tipo === "pendencia_cliente");
    const caminhoArq = `smoke/${tag}-ata.docx`;
    await salvarArquivo(caminhoArq, Buffer.from(docx));
    const [arq] = await registrarArquivosDaAta(rArq.reuniaoId, coord, [{ tipo: "anotacoes", caminho: caminhoArq, nome: "ata.docx", tamanho: docx.length }]);
    check("arquivo: coordenador recebe o caminho", (await arquivoParaEquipe(arq.id, coordU.id))?.caminho === caminhoArq);
    check("arquivo: projetista = null", (await arquivoParaEquipe(arq.id, projetistaU.id)) === null);
    check("arquivo: conta do cliente = null", (await arquivoParaEquipe(arq.id, joana.id)) === null);
    await descartarRascunho({ versaoId: rArq.versaoId, quem: coord });
    check("descartar apaga o arquivo do disco", !existsSync(resolverCaminho(caminhoArq)));

    // ── Cliente inativo e descartar ──
    const ri = await criarReuniaoComRascunho({ projetoId: projInativo.id, quem: coord, titulo: "Reunião inativo", data: "2026-11-10", texto: "Resumo\nTexto curto." });
    await publicar({ versaoId: ri.versaoId, quem: coord });
    check("conta de cliente inativo recusa", (await motivoDe(() => responderAta({ versaoId: ri.versaoId, conta: { userId: contaInativo.id, nome: contaInativo.name }, resposta: "concorda", observacao: null }))) === MOTIVO_NAO_ENCONTRADA);
    const rp = await criarReuniaoComRascunho({ projetoId: proj.id, quem: coord, titulo: "Reunião publicada", data: "2026-11-11", texto: "Resumo\nTexto." });
    await publicar({ versaoId: rp.versaoId, quem: coord });
    const correcao = await corrigirAta({ reuniaoId: rp.reuniaoId, quem: coord });
    const desc2 = await descartarRascunho({ versaoId: correcao.versaoId, quem: coord });
    check("descartar a correção mantém a reunião publicada", !desc2.reuniaoApagada && (await prisma.ataVersao.count({ where: { reuniaoId: rp.reuniaoId, estado: "publicada" } })) === 1);
    // Título e data de uma correção em rascunho não aparecem para o cliente antes de publicar.
    const corr2 = await corrigirAta({ reuniaoId: rp.reuniaoId, quem: coord });
    await salvarRascunho({ versaoId: corr2.versaoId, quem: coord, texto: "Resumo revisado.", itens: [], titulo: "Título ainda não revisado", data: "2026-11-12" });
    const antesDePublicar = (await atasParaCliente(proj.id, joana.id))?.reunioes.find((x) => x.id === rp.reuniaoId);
    check("correção em rascunho não muda título nem data para o cliente", antesDePublicar?.titulo === "Reunião publicada" && antesDePublicar.data === "2026-11-11");
    const naEquipe = (await atasParaEquipe(proj.id, coordU.id))?.reunioes.find((x) => x.id === rp.reuniaoId);
    check("a equipe vê o título e a data do rascunho no rascunho", naEquipe?.rascunho?.titulo === "Título ainda não revisado" && naEquipe.rascunho.data === "2026-11-12");
    await publicar({ versaoId: corr2.versaoId, quem: coord });
    const depoisDePublicar = (await atasParaCliente(proj.id, joana.id))?.reunioes.find((x) => x.id === rp.reuniaoId);
    check("publicar a correção aplica título e data", depoisDePublicar?.titulo === "Título ainda não revisado" && depoisDePublicar.data === "2026-11-12");
    const rd = await criarReuniaoComRascunho({ projetoId: proj.id, quem: coord, texto: "texto livre" });
    const desc = await descartarRascunho({ versaoId: rd.versaoId, quem: coord });
    check("descartar o rascunho da 1ª versão apaga a reunião", desc.reuniaoApagada && (await prisma.reuniaoProjeto.count({ where: { id: rd.reuniaoId } })) === 0);
  } finally {
    const remover = async (rotulo: string, id: string, apagar: () => Promise<unknown>) => {
      try {
        await apagar();
      } catch (e) {
        console.error(`[limpeza] não removeu ${rotulo} ${id}:`, e);
      }
    };
    const ligadas = await prisma.tarefaDaAta.findMany({ where: { reuniao: { projetoId: { in: projetos } } }, select: { tarefaId: true } });
    for (const t of new Set([...tarefasCriadas, ...ligadas.map((l) => l.tarefaId)])) await remover("tarefa", t, () => prisma.tarefa.deleteMany({ where: { id: t } }));
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
