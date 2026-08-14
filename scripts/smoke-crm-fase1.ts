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
import { aceitarProposta, criarPropostaDeLead } from "../src/modules/comercial/service";
import { formatarNumeroProposta } from "../src/modules/comercial/numeracao";

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

  // ── 3. aceite com itens: cria projeto + 1 disciplina por item, na ordem ──
  await prisma.propostaItem.createMany({
    data: [
      { propostaId: proposta.id, disciplina: "Estrutural", valor: 15000, ordem: 0 },
      { propostaId: proposta.id, disciplina: "Elétrico", valor: 8000, ordem: 1 },
      { propostaId: proposta.id, disciplina: "Hidrossanitário", valor: 5000, ordem: 2 },
    ],
  });

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
    projeto.disciplinas[0].nome === "Estrutural" &&
      Number(projeto.disciplinas[0].valor) === 15000 &&
      projeto.disciplinas[1].nome === "Elétrico" &&
      Number(projeto.disciplinas[1].valor) === 8000 &&
      projeto.disciplinas[2].nome === "Hidrossanitário" &&
      Number(projeto.disciplinas[2].valor) === 5000,
  );

  const propostaAceita = await prisma.proposta.findUniqueOrThrow({ where: { id: proposta.id } });
  check("proposta vira aceita", propostaAceita.status === "aceita");
  check("aceitaEm é carimbado", !!propostaAceita.aceitaEm);
  check("proposta aponta para o projeto gerado", propostaAceita.projetoId === projetoId);
  check("token do link público NÃO muda no aceite", propostaAceita.token === proposta.token);
  check("número da proposta NÃO muda no aceite", propostaAceita.numero === proposta.numero);

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
  await prisma.notificacao.deleteMany({ where: { href: `/projetos/${projetoId}` } });
  await prisma.proposta.update({ where: { id: proposta.id }, data: { projetoId: null } });
  await prisma.projeto.delete({ where: { id: projetoId } });
  await prisma.propostaItem.deleteMany({ where: { propostaId: proposta.id } });
  await prisma.proposta.delete({ where: { id: proposta.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  if (criouCliente) await prisma.cliente.delete({ where: { id: proposta.clienteId } });

  console.log(ok ? "\nSmoke do CRM Fase 1: OK" : "\nSmoke do CRM Fase 1: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
