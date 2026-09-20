/**
 * Smoke da proposta composta (ADR-0006, G4+G5) contra o banco de dev.
 *
 * Prova o ciclo inteiro com dado real: criar a partir do modelo → o texto que entrou é o certo
 * para a UF → salvar gera versão → o documento monta (ou é IMPEDIDO) → a página pública só
 * publica o que está completo.
 *
 * Não sobe servidor nem Chrome: o que depende de navegador (o PDF em si) é conferido pelo
 * `verify-fluxo-estudio.tsx`, que já mede o corte de texto no layout.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/smoke-proposta-composta.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { criarPropostaComposta, garantirPropostaEnviavel, salvarPropostaComposta } from "@/modules/comercial/proposta-composta/service";
import { carregarDocumentoProposta } from "@/modules/comercial/proposta-composta/documento-dados";
import { CHAVE_DADOS_EMPRESA } from "@/modules/configuracoes/empresa/queries";

let ok = true;
const check = (nome: string, cond: boolean, detalhe = "") => {
  console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) ok = false;
};
async function recusa(nome: string, fn: () => Promise<unknown>, re: RegExp) {
  try {
    await fn();
    check(nome, false, "não recusou");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(nome, re.test(msg), `"${msg}"`);
  }
}

async function main() {
  const autor = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  const cliente = await prisma.cliente.findFirst({ select: { id: true, nome: true } });
  const modelo = await prisma.modeloProposta.findUnique({ where: { slug: "multidisciplinar" }, select: { id: true } });
  if (!autor || !cliente || !modelo) throw new Error("dev sem admin, cliente ou modelo semeado — rode npm run db:seed");

  const empresaAntes = await prisma.configSistema.findUnique({ where: { chave: CHAVE_DADOS_EMPRESA } });

  const negociacao = await prisma.negociacao.create({
    data: {
      titulo: "SMOKE composta",
      clienteId: cliente.id,
      estagio: "ORCAMENTO",
      valorEstimado: 0,
    },
    select: { id: true },
  });

  console.log("\n── criação a partir do modelo ────────────────────────────────\n");
  const criada = await criarPropostaComposta(
    {
      negociacaoId: negociacao.id,
      modeloId: modelo.id,
      titulo: "SMOKE — projetos",
      obraEndereco: "Rua do Smoke, 1",
      obraCidade: "Maceió",
      obraUF: "AL",
      areaM2: 800,
      itens: [
        { disciplina: "Estrutural", valor: 60_000 },
        { disciplina: "Incêndio (PPCI)", valor: 40_000 },
      ],
    },
    autor.id,
  );
  check("consome o número sequencial como qualquer proposta", /^PR-\d+$/.test(criada.numero), criada.numero);
  check("nenhum aviso de cláusula quebrada no modelo semeado", criada.avisos.length === 0, criada.avisos.join(" | "));

  const p1 = await prisma.proposta.findUnique({
    where: { id: criada.propostaId },
    include: { secoes: { orderBy: { ordem: "asc" }, include: { clausula: { select: { slug: true } } } }, parcelas: true, versoes: true },
  });
  check("nasce com formato composta e o modelo carimbado", p1?.formato === "composta" && p1?.modeloId === modelo.id);
  check("copia o plano sugerido do modelo (40/30/30)", p1?.parcelas.length === 3);
  check("cria a versão 1", p1?.versoes.length === 1 && p1.versoes[0].numero === 1);

  const slugs = (p1?.secoes ?? []).map((s) => s.clausula?.slug).filter(Boolean);
  check(
    "obra em AL recebe a cláusula de PCI GENÉRICA, nunca o COSCIP de Pernambuco",
    slugs.includes("escopo-pci") && !slugs.includes("escopo-pci-pe"),
    slugs.join(", "),
  );
  check(
    "o escopo entra por disciplina contratada (estrutural + PCI)",
    (p1?.secoes ?? []).filter((s) => s.secao === "escopo").length === 2,
  );

  console.log("\n── a mesma proposta em PE pega a variante do estado ──────────\n");
  const emPE = await criarPropostaComposta(
    {
      negociacaoId: negociacao.id,
      modeloId: modelo.id,
      titulo: "SMOKE — PE",
      obraCidade: "Recife",
      obraUF: "PE",
      itens: [{ disciplina: "Incêndio (PPCI)", valor: 10_000 }],
    },
    autor.id,
  );
  const secoesPE = await prisma.propostaSecao.findMany({
    where: { propostaId: emPE.propostaId },
    include: { clausula: { select: { slug: true } } },
  });
  check(
    "obra em PE recebe o COSCIP",
    secoesPE.some((s) => s.clausula?.slug === "escopo-pci-pe"),
    secoesPE.map((s) => s.clausula?.slug).filter(Boolean).join(", "),
  );

  console.log("\n── documento: o que impede publicar ─────────────────────────\n");
  // Sem dados da empresa, o documento não sai — o timbre e a conta vêm de lá.
  await prisma.configSistema.deleteMany({ where: { chave: CHAVE_DADOS_EMPRESA } });
  const semEmpresa = await carregarDocumentoProposta(criada.propostaId);
  check("sem Configurações → Empresa, o documento é impedido", (semEmpresa?.impedimentos ?? []).some((m) => /Empresa/.test(m)));

  await prisma.configSistema.upsert({
    where: { chave: CHAVE_DADOS_EMPRESA },
    create: {
      chave: CHAVE_DADOS_EMPRESA,
      valor: {
        razaoSocial: "Empresa do Smoke Ltda.",
        cnpj: "00.000.000/0001-00",
        endereco: "Rua Teste, 1",
        telefone: "(82) 3333-0000",
        email: "smoke@exemplo.com",
        banco: "Banco Teste",
        agencia: "1234",
        conta: "56789-0",
        responsavelNome: "Responsável Smoke",
        responsavelCargo: "Engenheiro",
        responsavelRegistro: "CREA-AL 000",
      },
    },
    update: {},
  });

  const doc = await carregarDocumentoProposta(criada.propostaId);
  check("com a empresa configurada, o documento monta sem impedimento", (doc?.impedimentos ?? []).length === 0, (doc?.impedimentos ?? []).join(" | "));
  check("o total sai por extenso, calculado do número", String(doc?.escalar.TotalExtenso) === "cem mil reais", String(doc?.escalar.TotalExtenso));
  check(
    "o plano de pagamento traz percentual, valor e extenso",
    String(doc?.escalar.PlanoPagamento).split("\n").length === 3 &&
      String(doc?.escalar.PlanoPagamento).includes("quarenta mil reais"),
  );
  check("os dados bancários vêm do cadastro, não da proposta", String(doc?.escalar.DadosBancarios).includes("Banco Teste"));
  check("as seções viram as linhas da banda de detalhe", (doc?.porFonte["proposta-secoes"].linhas.length ?? 0) > 0);
  check("os tokens dentro da cláusula foram resolvidos", !JSON.stringify(doc?.porFonte).includes("[Cidade]"));
  check("usa o layout salvo no Estúdio (semeado), não o de fábrica", doc?.modeloDeFabrica === false);

  console.log("\n── plano que não fecha 100% ─────────────────────────────────\n");
  await salvarPropostaComposta(
    {
      id: criada.propostaId,
      titulo: "SMOKE — projetos",
      obraCidade: "Maceió",
      obraUF: "AL",
      itens: [{ disciplina: "Estrutural", valor: 100_000 }],
      secoes: (p1?.secoes ?? []).map((s) => ({ secao: s.secao, titulo: s.titulo ?? undefined, texto: s.texto })),
      parcelas: [
        { descricao: "Sinal", percentual: 50 },
        { descricao: "Entrega", percentual: 60 },
      ],
    },
    autor.id,
  );
  check("rascunho com 110% É SALVO (quem monta adiciona uma parcela por vez)", true);
  const docQuebrado = await carregarDocumentoProposta(criada.propostaId);
  check(
    "mas o documento fica impedido enquanto não fechar 100%",
    (docQuebrado?.impedimentos ?? []).some((m) => m.includes("110%")),
    (docQuebrado?.impedimentos ?? []).join(" | "),
  );
  await recusa(
    "e o envio é recusado com a mesma regra",
    () => garantirPropostaEnviavel(criada.propostaId),
    /110%|100%/,
  );

  const versoes = await prisma.propostaVersao.count({ where: { propostaId: criada.propostaId } });
  check("cada salvamento gera uma versão", versoes === 2, String(versoes));

  console.log("\n── limpeza ──────────────────────────────────────────────────\n");
  await prisma.proposta.deleteMany({ where: { id: { in: [criada.propostaId, emPE.propostaId] } } });
  await prisma.negociacao.delete({ where: { id: negociacao.id } });
  if (empresaAntes) {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_DADOS_EMPRESA },
      create: { chave: CHAVE_DADOS_EMPRESA, valor: empresaAntes.valor as object },
      update: { valor: empresaAntes.valor as object },
    });
  } else {
    await prisma.configSistema.deleteMany({ where: { chave: CHAVE_DADOS_EMPRESA } });
  }
  const sobrou = await prisma.propostaSecao.count({ where: { propostaId: criada.propostaId } });
  check("apagar a proposta leva seções e parcelas junto (cascade)", sobrou === 0);

  console.log(`\n${ok ? "✔ Proposta composta: tudo verde." : "✖ Proposta composta: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
  await prisma.$disconnect();
}

main();
