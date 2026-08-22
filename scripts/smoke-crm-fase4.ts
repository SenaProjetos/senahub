/**
 * Smoke da Fase 4 do CRM (Sales Navigator) — exercita `criarProspeccaoRapida` (F4.3) contra o
 * banco de dev.
 *
 * ⚠️ Existe um `scripts/smoke-fase4.ts` NÃO RELACIONADO (outra fase, outro sistema) — o prefixo
 * `smoke-crm-` deste arquivo é deliberado, ver F4.7 no `04-plano-fases.md`.
 *
 * Por que existe: `criarProspeccaoRapida` é uma transação de 5 passos (empresa → contato →
 * prospecção → vínculo → abordagem) com duas regras que só se provam contra Postgres real —
 * "tudo-ou-nada" (uma falha no meio não deixa `Cliente` órfão) e "2º prospect da mesma empresa
 * reaproveita a empresa E a prospecção ativa" — nenhuma das duas é alcançável por `vitest`.
 *
 * ⚠️ NUNCA RODAR CONTRA PRODUÇÃO. Cria e apaga clientes, contatos, leads e atividades. Tudo com
 * prefixo `SMKF4_`, limpeza no `finally`.
 *
 * Uso: npm run smoke:crm-fase4
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { criarProspeccaoRapida } from "../src/modules/comercial/service";
import { buscarEmpresaParaProspeccaoRapida, buscarContatoNaEmpresa } from "../src/modules/comercial/queries";

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
