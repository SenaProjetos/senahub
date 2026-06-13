/**
 * Dados de demonstração — simula o sistema "em uso corrente".
 * Vários clientes, projetos, propostas, leads, lançamentos (6 meses), folha,
 * EAP, recursos, tarefas, agenda, jurídico, licitações, suporte, chat e snapshots.
 *
 * IDEMPOTENTE: limpa os dados de negócio (preserva seed/catálogos + admin) e recria.
 * Uso:  npm run seed:demo
 *
 * Usuários demo (senha única, sem troca obrigatória): Demo@2026
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { addDays, subDays, subMonths } from "date-fns";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { ensureCanalGeral, ensureCanaisProjeto } from "../src/modules/chat/service";
import { calcularEncargos, type Faixa } from "../src/lib/encargos";
import type { StatusDisciplina } from "../src/generated/prisma/client";

const SENHA = "Demo@2026";
const hoje = new Date();
const dia = (offset: number) => addDays(hoje, offset);
const dataDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

async function limpar() {
  // Ordem FK-safe (filhos → pais). Preserva catálogos do seed e o admin.
  await prisma.mensagem.deleteMany({});
  await prisma.canalMembro.deleteMany({});
  await prisma.canal.deleteMany({});
  await prisma.atividadeLead.deleteMany({});
  await prisma.propostaVisualizacao.deleteMany({});
  await prisma.propostaVersao.deleteMany({});
  await prisma.propostaCondicao.deleteMany({});
  await prisma.propostaItem.deleteMany({});
  await prisma.proposta.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.metaComercial.deleteMany({});
  await prisma.holeriteItem.deleteMany({});
  await prisma.holerite.deleteMany({});
  await prisma.medicaoLicitacao.deleteMany({});
  await prisma.docLicitacaoVersao.deleteMany({});
  await prisma.documentoLicitacao.deleteMany({});
  await prisma.licitacao.deleteMany({});
  await prisma.docJuridicoVersao.deleteMany({});
  await prisma.documentoJuridico.deleteMany({});
  await prisma.certidao.deleteMany({});
  await prisma.ticketMensagem.deleteMany({});
  await prisma.ticketSuporte.deleteMany({});
  await prisma.compromisso.deleteMany({});
  await prisma.alocacao.deleteMany({});
  await prisma.recurso.deleteMany({});
  await prisma.eapDependencia.deleteMany({});
  await prisma.eapTarefa.deleteMany({});
  await prisma.tarefaDependencia.deleteMany({});
  await prisma.tarefaItem.deleteMany({});
  await prisma.tarefaResponsavel.deleteMany({});
  await prisma.tarefa.deleteMany({});
  await prisma.pagamentoProjetista.deleteMany({});
  await prisma.upload.deleteMany({});
  await prisma.revisaoDisciplina.deleteMany({});
  await prisma.disciplinaResponsavel.deleteMany({});
  await prisma.disciplina.deleteMany({});
  await prisma.folhaPagamento.deleteMany({});
  await prisma.lancamento.deleteMany({});
  await prisma.projetoMembro.deleteMany({});
  await prisma.projeto.deleteMany({});
  await prisma.contatoCliente.deleteMany({});
  await prisma.cliente.deleteMany({});
  await prisma.qualidadeSnapshot.deleteMany({});
  await prisma.dashboardSnapshot.deleteMany({});
  await prisma.encargoFaixa.deleteMany({});
  await prisma.transacaoBancaria.deleteMany({});
  await prisma.extratoBancario.deleteMany({});
  await prisma.contaBancaria.deleteMany({});
  // Usuários demo (tudo que não é o admin). Sessions/accounts caem por cascade.
  await prisma.user.deleteMany({ where: { role: { not: "admin" } } });
}

async function criarUsuario(name: string, email: string, role: string, clienteId?: string) {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(SENHA);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: true,
      role: role as never,
      ativo: true,
      mustChangePassword: false,
      clienteId: clienteId ?? null,
    },
  });
  await prisma.account.create({
    data: { userId: user.id, providerId: "credential", accountId: user.id, password: hash },
  });
  return user;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin não encontrado — rode o seed base antes (npm run db:seed).");

  console.log("Limpando dados de negócio…");
  await limpar();

  // ── Usuários internos ───────────────────────────────────────
  const supervisor = await criarUsuario("Helena Marques", "helena@demo.senahub", "supervisor");
  const administrativo = await criarUsuario("Paulo Ramos", "paulo@demo.senahub", "administrativo");
  const ana = await criarUsuario("Ana Silva", "ana@demo.senahub", "projetista_pj");
  const bruno = await criarUsuario("Bruno Costa", "bruno@demo.senahub", "projetista_pj");
  const carla = await criarUsuario("Carla Dias", "carla@demo.senahub", "clt");
  const diego = await criarUsuario("Diego Melo", "diego@demo.senahub", "estagiario");
  const elis = await criarUsuario("Elis Rocha", "elis@demo.senahub", "freelancer");
  const projetistas = [ana, bruno, elis];
  const internos = [admin, supervisor, administrativo, ana, bruno, carla, diego, elis];

  // ── Clientes ────────────────────────────────────────────────
  const clientesData = [
    { tipo: "PJ", nome: "Construtora Alfa Ltda", nomeFantasia: "Alfa", documento: "12.345.678/0001-90", email: "contato@alfa.com", telefone: "(62) 3211-0001", cidade: "Goiânia", uf: "GO", logradouro: "Av. T-63", numero: "1200" },
    { tipo: "PJ", nome: "Incorporadora Beta S.A.", nomeFantasia: "Beta", documento: "98.765.432/0001-10", email: "obras@beta.com", telefone: "(62) 3211-0002", cidade: "Aparecida de Goiânia", uf: "GO", logradouro: "Rua 10", numero: "55" },
    { tipo: "PJ", nome: "Prefeitura de São José", documento: "11.222.333/0001-44", email: "engenharia@saojose.gov.br", cidade: "São José", uf: "GO" },
    { tipo: "PF", nome: "João Pereira", documento: "123.456.789-00", email: "joao.pereira@email.com", telefone: "(62) 99999-1111", cidade: "Goiânia", uf: "GO" },
    { tipo: "PF", nome: "Maria Santos", documento: "987.654.321-00", email: "maria.santos@email.com", telefone: "(62) 99999-2222", cidade: "Anápolis", uf: "GO" },
    { tipo: "PJ", nome: "Loteamentos Sul Empreendimentos", nomeFantasia: "Sul Loteamentos", documento: "44.555.666/0001-77", email: "projetos@sul.com", cidade: "Senador Canedo", uf: "GO" },
  ] as const;
  const clientes: { id: string; nome: string; cidade: string | null }[] = [];
  for (const c of clientesData) {
    clientes.push(await prisma.cliente.create({ data: { ...c, tipo: c.tipo as never } }));
  }

  // Usuários de portal (cliente) vinculados
  const portalAlfa = await criarUsuario("Portal Alfa", "portal@alfa.com", "cliente", clientes[0].id);
  const portalBeta = await criarUsuario("Portal Beta", "portal@beta.com", "cliente", clientes[1].id);

  // ── Categorias / contas ─────────────────────────────────────
  const cats = await prisma.categoriaFinanceira.findMany({ select: { id: true, codigo: true, tipo: true } });
  const catReceita = cats.filter((c) => c.tipo === "receita" && c.codigo.includes("."));
  const catDespesa = cats.filter((c) => c.tipo === "despesa" && c.codigo.includes("."));
  const pickR = (i: number) => catReceita[i % catReceita.length].id;
  const pickD = (i: number) => catDespesa[i % catDespesa.length].id;

  const contaCorrente = await prisma.contaBancaria.create({
    data: { nome: "Conta Corrente — Banco do Brasil", tipo: "corrente", banco: "001", saldoInicial: 85000, padrao: true, ordem: 0 },
  });
  await prisma.contaBancaria.create({
    data: { nome: "Poupança — Caixa", tipo: "poupanca", banco: "104", saldoInicial: 40000, ordem: 1 },
  });

  // ── Projetos + disciplinas + responsáveis + membros ─────────
  const DISC = ["Estrutural", "Hidrossanitário", "Elétrico", "Arquitetônico", "Fundações", "Prevenção de Incêndio"];
  const STATUSES: StatusDisciplina[] = ["aguardando", "em_andamento", "em_revisao", "entregue", "aprovado"];
  const projetosDef = [
    { nome: "Residencial Vila Real", cli: 0, sit: "em_andamento", area: 320, discs: 4, prazo: 40 },
    { nome: "Centro Logístico Anhanguera", cli: 1, sit: "em_andamento", area: 1800, discs: 5, prazo: 70 },
    { nome: "Ed. Comercial Faria Lima", cli: 1, sit: "em_andamento", area: 950, discs: 3, prazo: 25 },
    { nome: "Galpão Industrial Jundiaí", cli: 5, sit: "em_andamento", area: 2400, discs: 3, prazo: 12 },
    { nome: "Hospital Municipal Norte", cli: 2, sit: "em_andamento", area: 5200, discs: 6, prazo: 90 },
    { nome: "Casa Alto Padrão — João", cli: 3, sit: "em_andamento", area: 480, discs: 4, prazo: 55 },
    { nome: "Reforma Comercial — Maria", cli: 4, sit: "concluido", area: 140, discs: 2, prazo: -30 },
    { nome: "Loteamento Sul Fase 1", cli: 5, sit: "arquivado", area: 12000, discs: 3, prazo: -120 },
  ];
  const projetos: { id: string; nome: string; clienteId: string; disciplinas: { id: string }[] }[] = [];
  for (let pi = 0; pi < projetosDef.length; pi++) {
    const d = projetosDef[pi];
    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: "particular",
          situacao: d.sit as never,
          nome: d.nome,
          clienteId: clientes[d.cli].id,
          areaM2: d.area,
          prazoFinal: dia(d.prazo),
          endereco: `Quadra ${pi + 1}, Lote ${10 + pi} — ${clientes[d.cli].cidade ?? "Goiânia"}/GO`,
          disciplinas: {
            create: Array.from({ length: d.discs }, (_, j) => ({
              nome: DISC[j % DISC.length],
              status: STATUSES[(pi + j) % STATUSES.length],
              valor: 4000 + ((pi + j) % 5) * 1500,
              prazo: dia(d.prazo - j * 5),
              ordem: j,
            })),
          },
        },
        include: { disciplinas: true },
      });
    });
    // responsáveis + membros
    for (let j = 0; j < projeto.disciplinas.length; j++) {
      await prisma.disciplinaResponsavel.create({
        data: { disciplinaId: projeto.disciplinas[j].id, userId: projetistas[(pi + j) % projetistas.length].id },
      });
    }
    await prisma.projetoMembro.createMany({
      data: [
        { projetoId: projeto.id, userId: supervisor.id, papel: "coordenador" },
        { projetoId: projeto.id, userId: projetistas[pi % projetistas.length].id, papel: "projetista" },
      ],
      skipDuplicates: true,
    });
    projetos.push(projeto);
  }

  // ── Lançamentos (6 meses) ───────────────────────────────────
  let nLanc = 0;
  for (let m = 5; m >= 0; m--) {
    const base = subMonths(hoje, m);
    const ano = base.getFullYear();
    const mes = base.getMonth();
    // receitas confirmadas (entradas) + previstas
    for (let k = 0; k < 3; k++) {
      const valor = 18000 + ((m + k) % 4) * 9000;
      const data = dataDate(new Date(ano, mes, 5 + k * 7));
      await prisma.lancamento.create({
        data: {
          tipo: "receita",
          descricao: `Recebimento ${projetos[(m + k) % projetos.length].nome}`,
          valor,
          valorEfetivo: valor,
          status: "confirmado",
          data,
          dataConfirmacao: data,
          categoriaId: pickR(k),
          contaId: contaCorrente.id,
          projetoId: projetos[(m + k) % projetos.length].id,
          autorId: admin.id,
        },
      });
      nLanc++;
    }
    // despesas confirmadas
    for (let k = 0; k < 3; k++) {
      const valor = 6000 + ((m + k) % 5) * 2500;
      const data = dataDate(new Date(ano, mes, 8 + k * 6));
      await prisma.lancamento.create({
        data: {
          tipo: "despesa",
          descricao: ["Aluguel", "Salários", "Software/licenças", "Marketing", "Impostos"][k % 5],
          valor,
          valorEfetivo: valor,
          status: "confirmado",
          data,
          dataConfirmacao: data,
          categoriaId: pickD(k),
          contaId: contaCorrente.id,
          autorId: admin.id,
        },
      });
      nLanc++;
    }
  }
  // a receber / a pagar (previstos, futuros) p/ orçamento, fluxo projetado, balanço
  for (let k = 0; k < 6; k++) {
    await prisma.lancamento.create({
      data: {
        tipo: "receita",
        descricao: `A receber — ${projetos[k % projetos.length].nome}`,
        valor: 22000 + k * 4000,
        status: "previsto",
        data: dataDate(dia(7 + k * 9)),
        vencimento: dataDate(dia(7 + k * 9)),
        categoriaId: pickR(k),
        projetoId: projetos[k % projetos.length].id,
        clienteId: projetos[k % projetos.length].clienteId,
        autorId: admin.id,
      },
    });
    await prisma.lancamento.create({
      data: {
        tipo: "despesa",
        descricao: ["Fornecedor", "Encargos", "Serviços"][k % 3] + " a pagar",
        valor: 5000 + k * 1800,
        status: "previsto",
        data: dataDate(dia(5 + k * 8)),
        vencimento: dataDate(dia(5 + k * 8)),
        categoriaId: pickD(k),
        autorId: admin.id,
      },
    });
    nLanc += 2;
  }

  // ── Propostas + leads + meta ────────────────────────────────
  const seq = await prisma.propostaSequencia.upsert({
    where: { ano: hoje.getFullYear() },
    create: { ano: hoje.getFullYear(), ultimo: 0 },
    update: {},
  });
  let ultimoProp = seq.ultimo;
  const statusProp = ["rascunho", "enviada", "aceita", "enviada", "recusada", "aceita"] as const;
  for (let i = 0; i < statusProp.length; i++) {
    ultimoProp++;
    const cli = clientes[i % clientes.length];
    const area = 200 + i * 120;
    await prisma.proposta.create({
      data: {
        ano: hoje.getFullYear(),
        sequencial: ultimoProp,
        numero: `PR-${String(hoje.getFullYear()).slice(2)}${String(ultimoProp).padStart(4, "0")}`,
        titulo: `Proposta — ${cli.nome}`,
        clienteId: cli.id,
        status: statusProp[i] as never,
        areaM2: area,
        validade: dataDate(dia(20)),
        token: randomBytes(16).toString("hex"),
        autorId: admin.id,
        enviadaEm: statusProp[i] !== "rascunho" ? dia(-10 + i) : null,
        aceitaEm: statusProp[i] === "aceita" ? dia(-5 + i) : null,
        itens: {
          create: [
            { disciplina: "Estrutural", valor: area * 22, ordem: 0 },
            { disciplina: "Elétrico", valor: area * 11, ordem: 1 },
            { disciplina: "Hidrossanitário", valor: area * 13, ordem: 2 },
          ],
        },
        condicoes: {
          create: [
            { descricao: "Entrada", tipo: "percentual", valor: 30, ordem: 0 },
            { descricao: "Na entrega", tipo: "percentual", valor: 70, ordem: 1 },
          ],
        },
      },
    });
  }
  await prisma.propostaSequencia.update({ where: { ano: hoje.getFullYear() }, data: { ultimo: ultimoProp } });

  const etapas = await prisma.funilEtapa.findMany({ orderBy: { ordem: "asc" } });
  for (let i = 0; i < 8; i++) {
    const lead = await prisma.lead.create({
      data: {
        nome: `Lead ${["Edifício Aurora", "Galpão Oeste", "Clínica Vida", "Escola Modelo", "Resort Lago", "Condomínio Park", "Indústria Têxtil", "Shopping Centro"][i]}`,
        contato: "Responsável",
        email: `lead${i}@prospecto.com`,
        telefone: "(62) 98888-00" + String(i).padStart(2, "0"),
        origem: ["Indicação", "Site", "Feira", "Anúncio"][i % 4],
        valorEstimado: 30000 + i * 12000,
        etapaId: etapas[i % etapas.length].id,
        observacoes: "Contato inicial realizado.",
      },
    });
    await prisma.atividadeLead.create({
      data: { leadId: lead.id, autorId: administrativo.id, nota: "Primeiro contato e levantamento de necessidades." },
    });
  }
  await prisma.metaComercial.create({
    data: { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, valor: 150000 },
  });

  // ── Encargos (faixas DEMO) + folha ──────────────────────────
  const faixasInss: Faixa[] = [
    { limite: 1412, aliquota: 7.5, deduzir: 0 },
    { limite: 2666.68, aliquota: 9, deduzir: 0 },
    { limite: 4000.03, aliquota: 12, deduzir: 0 },
    { limite: 7786.02, aliquota: 14, deduzir: 0 },
  ];
  const faixasIrrf: Faixa[] = [
    { limite: 2259.2, aliquota: 0, deduzir: 0 },
    { limite: 2826.65, aliquota: 7.5, deduzir: 169.44 },
    { limite: 3751.05, aliquota: 15, deduzir: 381.44 },
    { limite: 4664.68, aliquota: 22.5, deduzir: 662.77 },
    { limite: 999999, aliquota: 27.5, deduzir: 896.0 },
  ];
  await prisma.encargoFaixa.createMany({
    data: [
      ...faixasInss.map((f, ordem) => ({ tipo: "inss", ordem, limite: f.limite, aliquota: f.aliquota, deduzir: f.deduzir })),
      ...faixasIrrf.map((f, ordem) => ({ tipo: "irrf", ordem, limite: f.limite, aliquota: f.aliquota, deduzir: f.deduzir })),
    ],
  });
  const folha = await prisma.folhaPagamento.create({
    data: { ano: subMonths(hoje, 1).getFullYear(), mes: subMonths(hoje, 1).getMonth() + 1, status: "aberta" },
  });
  for (const [user, salario] of [
    [carla, 6500],
    [diego, 1800],
  ] as const) {
    const enc = calcularEncargos(salario, faixasInss, faixasIrrf);
    await prisma.holerite.create({
      data: {
        folhaId: folha.id,
        userId: user.id,
        itens: {
          create: [
            { descricao: "Salário base", tipo: "provento", valor: salario },
            ...(enc.inss > 0 ? [{ descricao: "INSS", tipo: "desconto" as const, valor: enc.inss }] : []),
            ...(enc.irrf > 0 ? [{ descricao: "IRRF", tipo: "desconto" as const, valor: enc.irrf }] : []),
          ],
        },
      },
    });
  }

  // ── EAP (planejamento) no 1º projeto ────────────────────────
  const projEap = projetos[0];
  const mae = await prisma.eapTarefa.create({
    data: { projetoId: projEap.id, nome: "Projeto executivo", ordem: 0, inicioPrevisto: dataDate(dia(-20)), fimPrevisto: dataDate(dia(20)), inicioBaseline: dataDate(dia(-20)), fimBaseline: dataDate(dia(10)), progresso: 60 },
  });
  const f1 = await prisma.eapTarefa.create({
    data: { projetoId: projEap.id, parentId: mae.id, disciplinaId: projEap.disciplinas[0].id, nome: "Estrutural — cálculo", ordem: 1, inicioPrevisto: dataDate(dia(-15)), fimPrevisto: dataDate(dia(5)), inicioBaseline: dataDate(dia(-15)), fimBaseline: dataDate(dia(0)), progresso: 80 },
  });
  const f2 = await prisma.eapTarefa.create({
    data: { projetoId: projEap.id, parentId: mae.id, nome: "Compatibilização", ordem: 2, inicioPrevisto: dataDate(dia(6)), fimPrevisto: dataDate(dia(20)), inicioBaseline: dataDate(dia(1)), fimBaseline: dataDate(dia(12)), progresso: 0 },
  });
  await prisma.eapDependencia.create({ data: { tarefaId: f2.id, predecessoraId: f1.id } });

  // ── Recursos + alocações (com superalocação) ────────────────
  for (const u of [ana, bruno, carla, diego, elis]) {
    const cap = u.id === diego.id || u.id === elis.id ? 0.5 : 1.0;
    const rec = await prisma.recurso.create({ data: { userId: u.id, capacidade: cap, custoHora: cap === 0.5 ? 60 : 120 } });
    // aloca em 2 projetos; ana fica superalocada (70+60 > 100)
    const pcts = u.id === ana.id ? [70, 60] : [50, 30];
    for (let a = 0; a < pcts.length; a++) {
      await prisma.alocacao.create({
        data: { recursoId: rec.id, projetoId: projetos[a % projetos.length].id, percentual: pcts[a] },
      });
    }
  }

  // ── Tarefas (kanban) ────────────────────────────────────────
  const statusTarefa = await prisma.tarefaStatus.findMany({ orderBy: { ordem: "asc" } });
  const tarefasDef = [
    { t: "Revisar memorial estrutural", s: 1, resp: ana },
    { t: "Enviar ART", s: 0, resp: bruno },
    { t: "Compatibilizar elétrico × hidráulico", s: 1, resp: ana },
    { t: "Reunião de início — Hospital", s: 0, resp: supervisor },
    { t: "Fechar proposta Beta", s: 2, resp: administrativo },
    { t: "Aprovar prancha arquitetônica", s: 1, resp: bruno },
  ];
  for (let i = 0; i < tarefasDef.length; i++) {
    const td = tarefasDef[i];
    await prisma.tarefa.create({
      data: {
        titulo: td.t,
        descricao: "Tarefa de exemplo.",
        statusId: statusTarefa[td.s % statusTarefa.length].id,
        projetoId: projetos[i % projetos.length].id,
        prazo: dataDate(dia(3 + i * 2)),
        criadorId: admin.id,
        responsaveis: { create: [{ userId: td.resp.id }] },
        itens: { create: [{ descricao: "Item A", concluido: true, ordem: 0 }, { descricao: "Item B", concluido: false, ordem: 1 }] },
      },
    });
  }

  // ── Agenda ──────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    await prisma.compromisso.create({
      data: {
        titulo: ["Reunião de obra", "Visita técnica", "Apresentação ao cliente"][i],
        local: ["Escritório", "Canteiro", "Online"][i],
        inicio: addDays(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 10 + i), i + 1),
        fim: addDays(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 11 + i), i + 1),
        criadorId: admin.id,
        participantes: {
          create: [
            { userId: admin.id, confirmado: true },
            { userId: projetistas[i % projetistas.length].id, confirmado: i % 2 === 0 ? true : null },
          ],
        },
      },
    });
  }

  // ── Jurídico ────────────────────────────────────────────────
  await prisma.documentoJuridico.create({
    data: { titulo: "Contrato — Vila Real", tipo: "contrato", projetoId: projetos[0].id, clienteId: projetos[0].clienteId },
  });
  await prisma.documentoJuridico.create({
    data: { titulo: "Aditivo — Centro Logístico", tipo: "aditivo", projetoId: projetos[1].id, clienteId: projetos[1].clienteId },
  });
  const tipoCert = await prisma.certidaoTipo.findMany();
  if (tipoCert.length) {
    await prisma.certidao.create({ data: { tipoId: tipoCert[0].id, descricao: "CND Federal", validade: dataDate(dia(8)) } });
    await prisma.certidao.create({ data: { tipoId: tipoCert[Math.min(1, tipoCert.length - 1)].id, descricao: "FGTS", validade: dataDate(dia(40)) } });
    await prisma.certidao.create({ data: { tipoId: tipoCert[Math.min(2, tipoCert.length - 1)].id, descricao: "Trabalhista (vencida)", validade: dataDate(dia(-6)) } });
  }

  // ── Licitações ──────────────────────────────────────────────
  await prisma.licitacao.create({
    data: { titulo: "Pregão 012/2026 — Escola Estadual", orgao: "Secretaria de Educação", modalidade: "Pregão eletrônico", numeroEdital: "012/2026", prazoProposta: dataDate(dia(6)), valorEstimado: 480000, status: "em_andamento" },
  });
  const licGanha = await prisma.licitacao.create({
    data: { titulo: "Concorrência 003/2026 — Ponte Municipal", orgao: "Prefeitura de São José", modalidade: "Concorrência", numeroEdital: "003/2026", valorEstimado: 1200000, status: "ganha" },
  });
  await prisma.medicaoLicitacao.create({
    data: { licitacaoId: licGanha.id, numero: 1, descricao: "Medição 1 — mobilização", valor: 180000, data: dataDate(dia(-10)) },
  });

  // ── Suporte ─────────────────────────────────────────────────
  const tickets = [
    { t: "Não consigo subir arquivo grande", s: "aberto", autor: ana },
    { t: "Erro ao gerar relatório", s: "em_atendimento", autor: bruno },
    { t: "Dúvida sobre banco de horas", s: "resolvido", autor: carla },
  ] as const;
  for (const tk of tickets) {
    await prisma.ticketSuporte.create({
      data: { titulo: tk.t, descricao: "Descrição do problema relatado pelo usuário.", status: tk.s as never, autorId: tk.autor.id },
    });
  }

  // ── Snapshots (qualidade + dashboard) ───────────────────────
  for (let m = 4; m >= 1; m--) {
    const d = subMonths(hoje, m);
    await prisma.qualidadeSnapshot.create({
      data: { ano: d.getFullYear(), mes: d.getMonth() + 1, indice: 30 - m * 4 + (m % 2) * 3, totalDisciplinas: 18 + m, comRevisao: 6 - m },
    });
  }
  for (let d = 6; d >= 1; d--) {
    const dt = dataDate(subDays(hoje, d));
    await prisma.dashboardSnapshot.create({
      data: { dia: dt, projetosAtivos: 5 + (d % 3), receitaPrevista: 120000 + d * 8000, entregasPendentes: 4 + (d % 4), recebidoNoMes: 60000 + d * 5000 },
    });
  }

  // ── Chat (canais + mensagens) ───────────────────────────────
  await ensureCanalGeral();
  for (const p of projetos.slice(0, 4)) await ensureCanaisProjeto(p.id);
  const geral = await prisma.canal.findFirst({ where: { tipo: "geral" } });
  if (geral) {
    const msgs = [
      [admin, "Bom dia, equipe! Semana cheia de entregas."],
      [supervisor, "Pessoal, foco no Hospital Norte essa semana."],
      [ana, "Estrutural do Vila Real em revisão final."],
      [bruno, "Subi as pranchas do Centro Logístico."],
      [administrativo, "Proposta da Beta enviada, aguardando retorno."],
    ] as const;
    for (const [u, txt] of msgs) {
      await prisma.mensagem.create({ data: { canalId: geral.id, autorId: u.id, conteudo: txt } });
    }
  }

  // ── Resumo ──────────────────────────────────────────────────
  console.log("\n✔ Dados de demonstração criados:");
  console.log(`  ${internos.length} usuários internos + 2 de portal (cliente)`);
  console.log(`  ${clientes.length} clientes, ${projetos.length} projetos, ${nLanc} lançamentos`);
  console.log(`  6 propostas, 8 leads, folha + EAP + recursos + tarefas + agenda + jurídico + licitações + suporte + snapshots + chat`);
  console.log(`\n  Login dos usuários demo: senha ${SENHA} (sem troca obrigatória)`);
  console.log(`  Ex.: helena@demo.senahub (supervisor), ana@demo.senahub (projetista), portal@alfa.com (cliente)`);
  console.log(`  Admin permanece: tadrio@senaprojetos.com.br`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
