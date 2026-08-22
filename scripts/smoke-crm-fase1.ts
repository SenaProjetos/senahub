/**
 * Smoke da Fase 1a do CRM: caracteriza o ACEITE de proposta contra o banco de dev.
 *
 * Por que existe: `aceitarProposta` é o caminho mais crítico do módulo Comercial — cria o
 * Projeto, uma Disciplina por item da proposta (com o valor que vira pagamento de projetista),
 * abre os canais de chat e notifica a gestão. A Fase 5 vai reescrever esse fluxo; este smoke
 * fixa o comportamento ANTES disso, para a reescrita ter contra o que ser comparada.
 *
 * lint/tsc/vitest não alcançam isto: a lógica só se prova com Prisma real, transação real e o
 * fan-out de notificação real.
 *
 * ⚠️ NUNCA RODAR CONTRA PRODUÇÃO. O aceite consome `PropostaSequencia.ultimo` e
 * `ProjetoSequencia.ultimo` por upsert incremental — não há rollback. Rodar em prod queimaria
 * números de proposta e de projeto que a operação usa de verdade.
 *
 * Uso: npm run smoke:crm-fase1
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { aceitarProposta, criarPropostaDeLead, salvarProposta } from "../src/modules/comercial/service";
import { formatarNumeroProposta } from "../src/modules/comercial/numeracao";
import { itensPersistiveis, totalItens } from "../src/modules/comercial/honorarios";

async function main() {
  const tag = `SMKCRM_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { role: "admin", ativo: true } });
  if (!autor) throw new Error("Sem usuário admin no banco de dev — rode `npm run db:seed`.");

  const ano = new Date().getFullYear();

  // Baseline lido AGORA, no mesmo run — nunca número fixo. O banco de dev é compartilhado
  // com outras frentes de trabalho, então hardcodar contagem daria falso negativo.
  const antes = {
    propostaSeq: (await prisma.propostaSequencia.findUnique({ where: { ano } }))?.ultimo ?? 0,
    projetoSeq: (await prisma.projetoSequencia.findUnique({ where: { ano } }))?.ultimo ?? 0,
    projetos: await prisma.projeto.count(),
    disciplinas: await prisma.disciplina.count(),
  };

  const etapa = await prisma.funilEtapa.findFirst({ orderBy: { ordem: "asc" } });
  if (!etapa) throw new Error("Sem etapa de funil — rode `npm run db:seed`.");

  const lead = await prisma.lead.create({
    data: { nome: `${tag}_lead`, email: `${tag}@exemplo.test`, etapaId: etapa.id },
  });

  // ── 0b. F1.23 + F1.23a: atribuicao/origem/parceiro estruturados no Lead ──
  const canal = await prisma.canalAquisicao.findFirstOrThrow({ where: { nome: "Outro" } });
  const campanha = await prisma.campanha.create({ data: { nome: `${tag}_campanha`, canalId: canal.id } });
  const parceiro = await prisma.parceiro.create({ data: { nome: `${tag}_parceiro`, tipo: "PF" } });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { responsavelId: autor.id, canalId: canal.id, origemDetalhada: "teste smoke", campaignId: campanha.id, parceiroId: parceiro.id },
  });
  const leadComVinculos = await prisma.lead.findUniqueOrThrow({
    where: { id: lead.id },
    include: { responsavel: { select: { id: true } }, canal: true, campanha: { include: { canal: true } }, parceiro: true },
  });
  check("lead resolve responsavel", leadComVinculos.responsavel?.id === autor.id);
  check("lead resolve canal direto", leadComVinculos.canal?.nome === "Outro");
  check("lead resolve campanha, e a campanha resolve o PRÓPRIO canal", leadComVinculos.campanha?.canal?.nome === "Outro");
  check("lead resolve parceiro (ADR-19)", leadComVinculos.parceiro?.id === parceiro.id);
  check("origemDetalhada preservada", leadComVinculos.origemDetalhada === "teste smoke");

  // ── 0c. F1.23b: cadastrar 2, vincular um, trocar pelo outro (aceite literal da tarefa) ──
  const parceiro2 = await prisma.parceiro.create({ data: { nome: `${tag}_parceiro2`, tipo: "PJ" } });
  await prisma.lead.update({ where: { id: lead.id }, data: { parceiroId: parceiro2.id } });
  const leadTrocado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { parceiro: true } });
  check("trocar de parceiro reflete no lead", leadTrocado.parceiro?.id === parceiro2.id);

  // Arquivar tira da lista de ativos que alimenta o Select do formulário de lead — sem isso, um
  // parceiro desligado continuaria oferecido como opção pra vincular a leads novos.
  await prisma.parceiro.update({ where: { id: parceiro.id }, data: { ativo: false } });
  const ativosComTag = await prisma.parceiro.findMany({
    where: { ativo: true, nome: { in: [parceiro.nome, parceiro2.nome] } },
  });
  check("parceiro arquivado some da lista de ativos", ativosComTag.length === 1 && ativosComTag[0].id === parceiro2.id);
  // Mas o lead já vinculado ao parceiro arquivado continua resolvendo o nome — não é soft delete.
  const parceiroArquivadoAindaResolve = await prisma.parceiro.findUnique({ where: { id: parceiro.id } });
  check("parceiro arquivado continua existindo/resolvível (não some, só sai do Select)", parceiroArquivadoAindaResolve?.ativo === false);

  // ── 1. criarPropostaDeLead: converte o lead em cliente e numera a proposta ──
  const { proposta, criouCliente } = await criarPropostaDeLead(
    { leadId: lead.id, titulo: `${tag}_proposta` },
    autor.id,
  );
  check("lead sem cliente gera cliente novo", criouCliente);
  check(
    "proposta recebe o próximo número da sequência",
    proposta.numero === formatarNumeroProposta(ano, antes.propostaSeq + 1),
  );
  check("proposta nasce como rascunho", proposta.status === "rascunho");
  check("proposta fica vinculada ao lead", proposta.leadId === lead.id);

  const leadDepois = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  check("lead passa a apontar para o cliente criado", leadDepois.clienteId === proposta.clienteId);

  // ── 2. aceite sem itens é recusado ──
  let recusouSemItens = false;
  try {
    await aceitarProposta(proposta.id);
  } catch {
    recusouSemItens = true;
  }
  check("aceite sem itens é recusado", recusouSemItens);

  // ── 2b. F1.22: o total da tela é o total gravado ──────────────────────────
  // O critério da F1.22 é "total na tela = total no PDF". O PDF é renderizado da própria página
  // pública (`page.goto` em `/a/proposta/[token]`), então PDF e página pública são iguais por
  // construção — o que sobra provar é que o editor não exibe um número diferente do que persiste.
  //
  // Só um smoke alcança isto: `PropostaItem.valor` é `Decimal(14,2)`, e a divergência nasce no
  // ARREDONDAMENTO DO BANCO, que teste puro nenhum executa. Os valores abaixo têm 3 casas de
  // propósito — é o que acontece quando alguém digita o valor à mão (critério 2 da tarefa).
  const itensCrus = [
    { disciplina: "Estrutural", descricao: "", valor: 1000.555 },
    { disciplina: "Elétrico", descricao: "", valor: 2000.4 },
    { disciplina: "Hidrossanitário", descricao: "", valor: 1.005 },
  ];
  const naTela = totalItens(itensPersistiveis(itensCrus));
  await salvarProposta(
    { id: proposta.id, titulo: `${tag}_proposta`, itens: itensPersistiveis(itensCrus), condicoes: [] },
    autor.id,
  );
  const totalGravado = Number(
    (
      await prisma.propostaItem.aggregate({
        where: { propostaId: proposta.id },
        _sum: { valor: true },
      })
    )._sum.valor ?? 0,
  );
  check(`total da tela (${naTela}) = total gravado (${totalGravado})`, naTela === totalGravado);
  check(
    "…e a soma sem quantizar daria outro número — a checagem acima discrimina de verdade",
    itensCrus.reduce((s, i) => s + i.valor, 0) !== totalGravado,
  );

  // ── 3. aceite com itens: cria projeto + 1 disciplina por item, na ordem ──
  // Usa `salvarProposta` (o caminho REAL da aplicação) em vez de `createMany` direto: é ele que
  // resolve a FK da disciplina contra o catálogo (F1.19), e é isso que precisa ser exercitado.
  // As três existem no catálogo, então devem resolver FK. Item sem match no catálogo fica com
  // `disciplinaId` null e usa o texto legado — coberto pelo teste unitário de `nomeDisciplinaItem`.
  await salvarProposta(
    {
      id: proposta.id,
      titulo: `${tag}_proposta`,
      itens: [
        { disciplina: "Estrutural", valor: 15000 },
        { disciplina: "Elétrico", valor: 8000 },
        { disciplina: "Hidrossanitário", valor: 5000 },
      ],
      condicoes: [],
    },
    autor.id,
  );

  const { projetoId, codigo } = await aceitarProposta(proposta.id);
  check("aceite devolve projeto", !!projetoId && !!codigo);

  const projeto = await prisma.projeto.findUniqueOrThrow({
    where: { id: projetoId },
    include: { disciplinas: { orderBy: { ordem: "asc" } } },
  });
  check("projeto herda o título da proposta", projeto.nome === `${tag}_proposta`);
  check("projeto herda o cliente da proposta", projeto.clienteId === proposta.clienteId);
  check("projeto nasce como particular", projeto.tipo === "particular");
  check("uma disciplina por item da proposta", projeto.disciplinas.length === 3);
  check(
    "disciplinas preservam nome, valor e ordem dos itens",
    projeto.disciplinas[0].disciplinaTextoLegado === "Estrutural" &&
      Number(projeto.disciplinas[0].valor) === 15000 &&
      projeto.disciplinas[1].disciplinaTextoLegado === "Elétrico" &&
      Number(projeto.disciplinas[1].valor) === 8000 &&
      projeto.disciplinas[2].disciplinaTextoLegado === "Hidrossanitário" &&
      Number(projeto.disciplinas[2].valor) === 5000,
  );

  // ── 3b. F1.19: disciplina virou FK, com fallback para o texto original ────
  const itensDepois = await prisma.propostaItem.findMany({
    where: { propostaId: proposta.id },
    include: { disciplina: { select: { nome: true } } },
    orderBy: { ordem: "asc" },
  });
  check(
    "todo item resolve um nome de disciplina (via FK ou fallback)",
    itensDepois.every((it) => (it.disciplina?.nome ?? it.disciplinaTextoLegado).trim() !== ""),
  );
  check(
    "o texto original é sempre preservado",
    itensDepois.every((it) => it.disciplinaTextoLegado.trim() !== ""),
  );
  const comFk = itensDepois.filter((it) => it.disciplinaId !== null).length;
  console.log(
    `      ${comFk}/${itensDepois.length} itens resolveram FK do catálogo` +
      `${comFk < itensDepois.length ? " (o resto usa o texto legado — consolidação é a F1.21)" : ""}`,
  );
  check(
    "a soma dos valores NÃO mudou com a conversão",
    Number(
      (await prisma.propostaItem.aggregate({
        where: { propostaId: proposta.id },
        _sum: { valor: true },
      }))._sum.valor ?? 0,
    ) === 28000,
  );

  const propostaAceita = await prisma.proposta.findUniqueOrThrow({ where: { id: proposta.id } });
  check("proposta vira aceita", propostaAceita.status === "aceita");
  check("aceitaEm é carimbado", !!propostaAceita.aceitaEm);
  check("proposta aponta para o projeto gerado", propostaAceita.projetoId === projetoId);
  check("token do link público NÃO muda no aceite", propostaAceita.token === proposta.token);
  check("número da proposta NÃO muda no aceite", propostaAceita.numero === proposta.numero);

  // ── F5.9: o aceite foi reescrito; esta caracterização foi ATUALIZADA, não descartada ──────
  // Tudo acima passou sem uma linha de mudança — é a prova de que a reescrita preservou o
  // comportamento. O que segue é o que a F5.9 ACRESCENTOU, caracterizado aqui para que este
  // arquivo continue descrevendo o aceite ATUAL, e não o de antes dela.
  //
  // Esta proposta nasce de um LEAD (`criarPropostaDeLead`), então NÃO tem negociação — é
  // justamente o caminho de retrocompatibilidade: o aceite tem de funcionar igual, sem
  // inventar uma negociação que ninguém pediu.
  check("sem negociação vinculada, o aceite não inventa uma", propostaAceita.negociacaoId === null);
  const projetoDoAceite = await prisma.projeto.findUniqueOrThrow({
    where: { id: projetoId },
    select: { negociacaoId: true },
  });
  check(
    "§8.5 — sem negociação na proposta, o projeto também nasce sem (os dois lados concordam)",
    projetoDoAceite.negociacaoId === null,
  );
  const clienteDoAceite = await prisma.cliente.findUniqueOrThrow({
    where: { id: proposta.clienteId },
    select: { status: true },
  });
  check("F5.9 — a empresa passou a CLIENTE no aceite (ADR-08)", clienteDoAceite.status === "CLIENTE");
  const versaoAceita = await prisma.propostaVersao.findFirst({
    where: { propostaId: proposta.id },
    orderBy: { numero: "desc" },
    select: { status: true, valorVersao: true },
  });
  check(
    `F5.9 — versão vigente carimbada como aceita, valor final 28000 (veio: ${versaoAceita?.status} / ${versaoAceita?.valorVersao})`,
    versaoAceita?.status === "aceita" && Number(versaoAceita.valorVersao) === 28000,
  );

  // ── 4. aceitar de novo é recusado (idempotência do lado seguro) ──
  let recusouDuplicado = false;
  try {
    await aceitarProposta(proposta.id);
  } catch {
    recusouDuplicado = true;
  }
  check("aceitar proposta já aceita é recusado", recusouDuplicado);

  // ── 5. canais de chat do projeto ──
  const canais = await prisma.canal.count({ where: { projetoId } });
  check(`canais de chat criados para o projeto (${canais})`, canais > 0);

  // ── 6. deltas de sequência e contagem, contra o baseline deste mesmo run ──
  const depois = {
    propostaSeq: (await prisma.propostaSequencia.findUnique({ where: { ano } }))?.ultimo ?? 0,
    projetoSeq: (await prisma.projetoSequencia.findUnique({ where: { ano } }))?.ultimo ?? 0,
    projetos: await prisma.projeto.count(),
    disciplinas: await prisma.disciplina.count(),
  };
  check("sequência de proposta avançou exatamente 1", depois.propostaSeq === antes.propostaSeq + 1);
  check("sequência de projeto avançou exatamente 1", depois.projetoSeq === antes.projetoSeq + 1);
  check("um projeto a mais", depois.projetos === antes.projetos + 1);
  check("três disciplinas a mais", depois.disciplinas === antes.disciplinas + 3);

  // ── Limpeza ──────────────────────────────────────────────────────────────
  // `Disciplina` e `Canal` (+ membros/mensagens) caem por cascata do Projeto — só o vínculo
  // `Proposta.projetoId` precisa ser solto antes, senão o delete do projeto esbarra na FK.
  // As notificações do sino NÃO caem por cascata: saem pelo href do projeto.
  // As sequências NÃO voltam atrás (upsert incremental) — é o custo aceito deste smoke.
  // F3.2: os hooks de timeline passaram a criar `Atividade` no aceite, e ela tem FK NOT NULL
  // para `Cliente` — sem apagar antes, o delete do cliente no fim esbarra na constraint. Foi
  // este smoke que pegou a regressão quando os hooks entraram.
  await prisma.atividade.deleteMany({ where: { clienteId: proposta.clienteId } });
  await prisma.notificacao.deleteMany({ where: { href: `/projetos/${projetoId}` } });
  await prisma.proposta.update({ where: { id: proposta.id }, data: { projetoId: null } });
  await prisma.projeto.delete({ where: { id: projetoId } });
  await prisma.propostaItem.deleteMany({ where: { propostaId: proposta.id } });
  await prisma.proposta.delete({ where: { id: proposta.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  if (criouCliente) await prisma.cliente.delete({ where: { id: proposta.clienteId } });
  await prisma.campanha.delete({ where: { id: campanha.id } });
  await prisma.parceiro.delete({ where: { id: parceiro.id } });
  await prisma.parceiro.delete({ where: { id: parceiro2.id } });

  console.log(ok ? "\nSmoke do CRM Fase 1: OK" : "\nSmoke do CRM Fase 1: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
