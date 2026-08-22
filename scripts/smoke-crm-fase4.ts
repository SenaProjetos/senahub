/**
 * Smoke da Fase 4 do CRM (Sales Navigator) contra o banco de dev — um arquivo por fase (mesmo
 * padrão de `smoke-crm-fase1/2/3.ts`), crescendo tarefa a tarefa em vez de 1 arquivo por task.
 * Hoje cobre F4.3 (`criarProspeccaoRapida`) e F4.5 (importação CSV).
 *
 * ⚠️ Existe um `scripts/smoke-fase4.ts` NÃO RELACIONADO (outra fase, outro sistema) — o prefixo
 * `smoke-crm-` deste arquivo é deliberado, ver F4.7 no `04-plano-fases.md`.
 *
 * ── F4.3 ── `criarProspeccaoRapida` é uma transação de 5 passos (empresa → contato →
 * prospecção → vínculo → abordagem) com duas regras que só se provam contra Postgres real —
 * "tudo-ou-nada" (uma falha no meio não deixa `Cliente` órfão) e "2º prospect da mesma empresa
 * reaproveita a empresa E a prospecção ativa" — nenhuma das duas é alcançável por `vitest`.
 *
 * ── F4.5 ── `resolverLinhas` (puro) já tem cobertura de `vitest` em `processar.test.ts`; o que
 * só este smoke prova é o CICLO COMPLETO contra Postgres real: `carregarExistentesCrm` lendo o
 * banco de verdade, `executarCommitCrm` gravando numa transação de verdade, e reimportar o MESMO
 * arquivo uma 2ª vez batendo contra o que a 1ª rodada de fato persistiu — não uma simulação.
 *
 * ⚠️ NUNCA RODAR CONTRA PRODUÇÃO. Cria e apaga clientes, contatos, leads e atividades. Tudo com
 * prefixo `SMKF4_`, limpeza no `finally`.
 *
 * Uso: npm run smoke:crm-fase4
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { criarProspeccaoRapida } from "../src/modules/comercial/service";
import { buscarEmpresaParaProspeccaoRapida, buscarContatoNaEmpresa } from "../src/modules/comercial/queries";
import { resolverLinhas, contarBuckets, type LinhaCrmNorm } from "../src/modules/comercial/importacao/processar";
import { carregarExistentesCrm } from "../src/modules/comercial/importacao/queries";
import { executarCommitCrm } from "../src/modules/comercial/importacao/commit";

const TAG = `SMKF4_${Date.now()}`;

async function main() {
  let ok = true;
  const check = (nome: string, cond: boolean, detalhe = "") => {
    console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  const user = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  if (!user) throw new Error("dev incompleto — rode `npm run db:seed`.");

  console.log("\n── F4.3: empresa nova + contato novo (1º prospect) ────────────────\n");

  const nomeEmpresa = `${TAG}_Construtora`;
  const r1 = await criarProspeccaoRapida({
    urlPerfil: "https://www.linkedin.com/in/alguem-fake",
    urlAlvo: "contato",
    empresa: { nome: nomeEmpresa },
    contato: { nome: `${TAG}_Contato1`, email: "contato1@exemplo-smoke.com", cargo: "Diretor" },
    campanhaId: null,
    abordagem: { tipo: "LIGACAO", nota: "Ligação de teste do smoke." },
    autorId: user.id,
  });
  check("empresa criada, não reaproveitou nada", !r1.reaproveitouEmpresa && !r1.reaproveitouContato);
  check("prospecção nova, não reaproveitou ativa", !r1.reaproveitouProspeccaoAtiva);

  const clienteId = r1.clienteId;
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { statusAbordagem: true, listaSalesNavigator: true, dataInclusaoLista: true },
  });
  check("Cliente.statusAbordagem = ABORDADO", cliente?.statusAbordagem === "ABORDADO");
  check("Cliente.listaSalesNavigator = true (nasceu do fluxo)", cliente?.listaSalesNavigator === true);
  check("Cliente.dataInclusaoLista preenchida", cliente?.dataInclusaoLista != null);

  const contato1 = await prisma.contatoCliente.findUnique({
    where: { id: r1.contatoId },
    select: { statusAbordagem: true, dataCollectionSource: true, dataCollectedAt: true },
  });
  check("ContatoCliente.statusAbordagem = ABORDADO", contato1?.statusAbordagem === "ABORDADO");
  check(
    "ContatoCliente.dataCollectionSource = Sales Navigator (LGPD/T1)",
    contato1?.dataCollectionSource === "Sales Navigator",
  );
  check("ContatoCliente.dataCollectedAt preenchida", contato1?.dataCollectedAt != null);

  const [vinculo1, atividade1] = await Promise.all([
    prisma.leadContato.findFirst({ where: { leadId: r1.leadId, contatoId: r1.contatoId } }),
    prisma.atividade.findFirst({
      where: { leadId: r1.leadId, tipo: "LIGACAO", descricao: "Ligação de teste do smoke." },
    }),
  ]);
  check("LeadContato vincula o contato à prospecção", vinculo1 != null);
  check("Atividade da abordagem gravada (tipo real, não SISTEMA)", atividade1 != null);

  const eventosSistema = await prisma.atividade.count({
    where: { clienteId, tipo: "SISTEMA" },
  });
  check(
    "eventos automáticos gravados (empresa+contato+prospecção)",
    eventosSistema === 3,
    `${eventosSistema} de 3 esperados`,
  );

  console.log("\n── F4.3: 2º prospect da MESMA empresa (aceite da tarefa) ──────────\n");

  const r2 = await criarProspeccaoRapida({
    urlAlvo: "contato",
    empresa: { nome: nomeEmpresa }, // digitado de novo, não pelo id — é o que o usuário faria
    contato: { nome: `${TAG}_Contato2`, email: "contato2@exemplo-smoke.com" },
    campanhaId: null,
    abordagem: { tipo: "EMAIL", nota: "E-mail de teste do smoke." },
    autorId: user.id,
  });
  // `criarProspeccaoRapida` recebe NOME, não id — a service não faz fuzzy-match sozinha (isso é
  // `buscarEmpresaParaProspeccaoRapida`, do lado da UI). Passar o mesmo nome duas vezes SEM
  // resolver o id de propósito prova que a CAMADA DE SERVIÇO, sozinha, cria um 2º Cliente — o
  // que está correto: reaproveitar por nome é responsabilidade da tela (o Select "usar esta"),
  // não da service. O caminho real do dialog é o `r2b` logo abaixo, passando o id já resolvido.
  check("sem id resolvido, a service cria um 2º Cliente (comportamento esperado)", !r2.reaproveitouEmpresa);

  const r2b = await criarProspeccaoRapida({
    urlAlvo: "contato",
    empresa: { clienteId },
    contato: { nome: `${TAG}_Contato3`, email: "contato3@exemplo-smoke.com" },
    campanhaId: null,
    abordagem: { tipo: "WHATSAPP", nota: "WhatsApp de teste do smoke." },
    autorId: user.id,
  });

  // O que realmente evita duplicata é o CAMINHO DA UI (busca → "usar esta" → id resolvido),
  // não a service adivinhando por nome. Passando o id (r2b, o caminho real do dialog):
  check("empresa passada por id reaproveita, não duplica (caminho real da UI)", r2b.reaproveitouEmpresa === true);
  check(
    "prospecção ATIVA é reaproveitada — não abre uma 2ª",
    r2b.reaproveitouProspeccaoAtiva === true && r2b.leadId === r1.leadId,
  );

  const leadsDaEmpresa = await prisma.lead.count({ where: { clienteId } });
  check("continua existindo 1 única prospecção para a empresa", leadsDaEmpresa === 1, `${leadsDaEmpresa} lead(s)`);

  // Contato1 (r1) + Contato3 (r2b, mesmo clienteId por id) — Contato2 (r2) NÃO conta: nasceu
  // numa empresa nova, é o caso "sem id resolvido" do check logo acima, não este.
  const contatosNaProspeccao = await prisma.leadContato.count({ where: { leadId: r1.leadId } });
  check(
    "Contato1 (1º prospect) + Contato3 (id resolvido) na MESMA prospecção",
    contatosNaProspeccao === 2,
    `${contatosNaProspeccao} de 2`,
  );

  console.log("\n── F4.3: contato com opt-out recusa a abordagem ────────────────────\n");

  const contatoOptOut = await prisma.contatoCliente.create({
    data: { clienteId, nome: `${TAG}_ContatoOptOut`, optOut: true, optOutAt: new Date() },
  });
  let recusou = false;
  try {
    await criarProspeccaoRapida({
      urlAlvo: "contato",
      empresa: { clienteId },
      contato: { contatoId: contatoOptOut.id },
      campanhaId: null,
      abordagem: { tipo: "LIGACAO", nota: "Não deveria gravar." },
      autorId: user.id,
    });
  } catch {
    recusou = true;
  }
  check("contato opt-out recusa a abordagem (LGPD/T1)", recusou);
  const atividadeIndevida = await prisma.atividade.findFirst({
    where: { descricao: "Não deveria gravar." },
  });
  check("nada foi gravado quando recusou (transação não deixa resto)", atividadeIndevida == null);

  console.log("\n── F4.3: falha no meio do fluxo não deixa Cliente órfão ────────────\n");

  const nomeFalha = `${TAG}_EmpresaQueFalha`;
  const clientesAntes = await prisma.cliente.count();
  let falhouComoEsperado = false;
  try {
    await criarProspeccaoRapida({
      urlAlvo: "contato",
      empresa: { nome: nomeFalha },
      // Sem nome de contato E sem contatoId — a service recusa ("Informe o nome do contato.")
      // DEPOIS de já ter, na mesma transação, criado a empresa. É exatamente o caso que prova
      // atomicidade: se o `$transaction` não reverter, sobra um Cliente órfão.
      contato: {},
      campanhaId: null,
      abordagem: { tipo: "LIGACAO", nota: "x" },
      autorId: user.id,
    });
  } catch {
    falhouComoEsperado = true;
  }
  const clientesDepois = await prisma.cliente.count();
  check("a chamada falhou como esperado", falhouComoEsperado);
  check(
    "NENHUM Cliente órfão sobrou (rollback da transação)",
    clientesDepois === clientesAntes,
    `antes=${clientesAntes} depois=${clientesDepois}`,
  );
  const orfao = await prisma.cliente.findFirst({ where: { nome: nomeFalha } });
  check("a empresa da tentativa falha não existe no banco", orfao == null);

  console.log("\n── F4.3: buscas que a UI chama enquanto digita ─────────────────────\n");

  const buscaEmpresa = await buscarEmpresaParaProspeccaoRapida(nomeEmpresa);
  check(
    "busca de empresa acha a empresa (nome exato)",
    buscaEmpresa.some((c) => c.id === clienteId),
    `${buscaEmpresa.length} candidato(s)`,
  );
  const buscaVazia = await buscarEmpresaParaProspeccaoRapida("ab");
  check("busca de empresa com menos de 3 caracteres não roda", buscaVazia.length === 0);

  const buscaContato = await buscarContatoNaEmpresa(clienteId, `${TAG}_Contato1`);
  check(
    "busca de contato acha o contato dentro da empresa certa",
    buscaContato.some((c) => c.id === r1.contatoId),
    `${buscaContato.length} candidato(s)`,
  );
  const buscaContatoOutraEmpresa = await buscarContatoNaEmpresa("id-que-nao-existe", `${TAG}_Contato1`);
  check("busca de contato é escopada por empresa — não vaza pra outra", buscaContatoOutraEmpresa.length === 0);

  console.log("\n── F4.5: importação CSV — 100 linhas com 10 duplicatas ─────────────\n");

  // `similaridade` (dedupe.ts) é Levenshtein normalizado pelo TAMANHO TOTAL da string — um
  // prefixo comum longo (o TAG) some do cálculo (Levenshtein alinha o prefixo igual de graça),
  // então o que decide o score é só a PARTE QUE VARIA. "ImpEmpresa1" vs "ImpEmpresa2" variam em
  // 1 caractere só — score ~0.97, ACIMA do limiar 0.85 de match — e 90 "empresas" viravam 1 só
  // na 1ª tentativa deste smoke. Cada nome carrega 16 hex ALEATÓRIOS (não um índice decimal) —
  // dois valores aleatórios independentes desse tamanho não ficam Levenshtein-parecidos por
  // acaso (a chance de 2 entre 90 caírem sob 0.85 de distância é desprezível).
  const linha = (idx: number, overrides: Partial<LinhaCrmNorm> = {}): LinhaCrmNorm => ({
    idx,
    empresaNome: `${TAG}_Imp${randomBytes(8).toString("hex")}`,
    documento: "",
    nomeContato: `${TAG}_ImpContato${idx}`,
    cargo: "",
    emailContato: `imp${idx}@exemplo-smoke.com`,
    telefone: "",
    segmento: "",
    cidade: "",
    uf: "",
    linkedinUrl: "",
    observacao: "",
    erros: [],
    ...overrides,
  });

  // 90 linhas com empresa+contato distintos + 10 que REPETEM literalmente uma das 10 primeiras
  // (mesma empresa, mesmo e-mail de contato) — o caso mais estrito de "duplicata": nem a
  // pré-visualização nem o commit devem tratar isso como gente/empresa nova.
  const linhasBase: LinhaCrmNorm[] = Array.from({ length: 90 }, (_, i) => linha(i + 1));
  const linhasDuplicadas: LinhaCrmNorm[] = Array.from({ length: 10 }, (_, i) =>
    linha(90 + i + 1, { empresaNome: linhasBase[i].empresaNome, nomeContato: linhasBase[i].nomeContato, emailContato: linhasBase[i].emailContato }),
  );
  const arquivo100 = [...linhasBase, ...linhasDuplicadas];

  const existentesAntes = await carregarExistentesCrm();
  const resolvidas1 = resolverLinhas(arquivo100, existentesAntes);
  const preview1 = contarBuckets(resolvidas1);
  check("pré-visualização: 100 linhas no total", preview1.total === 100);
  check("pré-visualização marca as 10 duplicatas como 'vincular'", preview1.vinculados === 10, `${preview1.vinculados}`);
  check("pré-visualização: as outras 90 são 'criar'", preview1.criados === 90, `${preview1.criados}`);
  check(
    "buckets disjuntos somam o total (aceite: 'relatório final soma 100')",
    preview1.criados + preview1.vinculados + preview1.ignorados + preview1.erros === 100,
  );

  const commit1 = await executarCommitCrm(prisma, { resolvidas: resolvidas1, autorId: user.id, campanhaId: null });
  check("commit: contagens batem com a pré-visualização", commit1.criados === 90 && commit1.vinculados === 10);

  const [clientesCriados, leadsCriados, contatosCriados, leadContatosCriados] = await Promise.all([
    prisma.cliente.findMany({ where: { nome: { contains: `${TAG}_Imp` } }, select: { id: true } }),
    prisma.lead.count({ where: { nome: { contains: `${TAG}_Imp` } } }),
    prisma.contatoCliente.count({ where: { nome: { contains: `${TAG}_ImpContato` } } }),
    prisma.leadContato.count({ where: { lead: { nome: { contains: `${TAG}_Imp` } } } }),
  ]);
  check("90 Clientes novos no banco (as 10 duplicatas NÃO criaram outro)", clientesCriados.length === 90, `${clientesCriados.length}`);
  check("90 Leads (1 por empresa — as 10 duplicatas vincularam ao existente)", leadsCriados === 90, `${leadsCriados}`);
  check("90 Contatos novos (as 10 duplicatas reaproveitaram o contato)", contatosCriados === 90, `${contatosCriados}`);
  check(
    "90 LeadContato (join idempotente — duplicata repete o MESMO par, não soma)",
    leadContatosCriados === 90,
    `${leadContatosCriados}`,
  );

  console.log("\n── F4.5: reimportar o MESMO arquivo não cria nada novo ─────────────\n");

  const existentesDepois = await carregarExistentesCrm();
  const resolvidas2 = resolverLinhas(arquivo100, existentesDepois);
  const preview2 = contarBuckets(resolvidas2);
  check("2ª rodada: 0 criados (aceite: 'rodar o mesmo arquivo 2x não cria nada novo')", preview2.criados === 0, `${preview2.criados}`);
  check("2ª rodada: as 100 linhas vinculam ao que já existe", preview2.vinculados === 100, `${preview2.vinculados}`);

  const commit2 = await executarCommitCrm(prisma, { resolvidas: resolvidas2, autorId: user.id, campanhaId: null });
  check("commit da 2ª rodada também não cria nada", commit2.criados === 0);
  const clientesAposRerun = await prisma.cliente.count({ where: { nome: { contains: `${TAG}_Imp` } } });
  check("contagem de Clientes no banco não mudou após a 2ª rodada", clientesAposRerun === 90, `${clientesAposRerun}`);

  console.log("\n── F4.5: linha inválida e contato opt-out ficam de fora ────────────\n");

  const clienteOptOut = await prisma.cliente.create({ data: { nome: `${TAG}_ImpEmpresaOptOut`, tipo: "PJ" } });
  const contatoOptOutImp = await prisma.contatoCliente.create({
    data: { clienteId: clienteOptOut.id, nome: `${TAG}_ImpContatoOptOut`, email: "optout@exemplo-smoke.com", optOut: true, optOutAt: new Date() },
  });
  const arquivoComProblemas: LinhaCrmNorm[] = [
    linha(201, { empresaNome: "", nomeContato: "", erros: ["Sem nome da empresa.", "Sem nome do contato."] }),
    linha(202, { empresaNome: clienteOptOut.nome, nomeContato: contatoOptOutImp.nome, emailContato: contatoOptOutImp.email! }),
  ];
  const existentesComOptOut = await carregarExistentesCrm();
  const resolvidas3 = resolverLinhas(arquivoComProblemas, existentesComOptOut);
  const preview3 = contarBuckets(resolvidas3);
  check("linha sem empresa/contato vira 'erro'", preview3.erros === 1);
  check("linha para contato opt-out vira 'ignorado' (LGPD)", preview3.ignorados === 1);

  const commit3 = await executarCommitCrm(prisma, { resolvidas: resolvidas3, autorId: user.id, campanhaId: null });
  check("commit não grava nada dessas 2 linhas", commit3.criados === 0 && commit3.vinculados === 0);
  const leadDoOptOut = await prisma.lead.findFirst({ where: { clienteId: clienteOptOut.id } });
  check("contato opt-out não ganhou prospecção nova", leadDoOptOut == null);

  console.log(`\n${ok ? "✔ Fase 4: tudo verde." : "✖ Fase 4: há falhas acima."}`);
  console.log(
    "\n  Proxy medível do aceite '<60s': 1 chamada de service = 1 `$transaction` (5 passos " +
      "internos: empresa, contato, prospecção, vínculo, abordagem), 0 idas a mais ao servidor " +
      "depois de preencher o formulário. O cronômetro em si é verificação de usuário — mesma " +
      "lacuna já registrada desde a F3.4 (sem chromium-cli neste ambiente).",
  );
  if (!ok) process.exitCode = 1;
}

async function limpar() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { contains: TAG } }, select: { id: true } });
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return;
  const leads = await prisma.lead.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });
  const leadIds = leads.map((l) => l.id);
  await prisma.leadContato.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.atividade.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.contatoCliente.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
  });
