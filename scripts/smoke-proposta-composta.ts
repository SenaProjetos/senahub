/**
 * Smoke da proposta composta (ADR-0006, G4–G6) contra o banco de dev.
 *
 * Prova o ciclo inteiro com dado real: criar a partir do modelo → o texto que entrou é o certo
 * para a UF → salvar gera versão → o documento monta (ou é IMPEDIDO) → a mesma guarda vale para
 * o envio → o aceite cria o projeto → a proposta aceita não é mais editável.
 *
 * Não sobe servidor nem Chrome: o que depende de navegador é conferido por
 * `verify-documento-proposta.tsx` e `verify-fluxo-estudio.tsx`.
 *
 * Cria um cliente PRÓPRIO (o aceite gera um projeto e não pode prender-se a um cliente real do
 * dev) e apaga tudo no fim, inclusive quando um passo falha no meio.
 *
 * Uso: npm run smoke:proposta-composta
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { aceitarProposta } from "@/modules/comercial/service";
import {
  criarPropostaComposta,
  garantirPropostaEnviavel,
  salvarPropostaComposta,
} from "@/modules/comercial/proposta-composta/service";
import { carregarDocumentoProposta } from "@/modules/comercial/proposta-composta/documento-dados";
import { CHAVE_DADOS_EMPRESA } from "@/modules/configuracoes/empresa/queries";

const TAG = "SMOKE-COMPOSTA";
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

const EMPRESA_SMOKE = {
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
};

let empresaSalva: { valor: unknown } | null = null;

async function restaurarEmpresa() {
  if (empresaSalva) {
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_DADOS_EMPRESA },
      create: { chave: CHAVE_DADOS_EMPRESA, valor: empresaSalva.valor as object },
      update: { valor: empresaSalva.valor as object },
    });
  } else {
    await prisma.configSistema.deleteMany({ where: { chave: CHAVE_DADOS_EMPRESA } });
  }
}

/** Apaga tudo o que o smoke criou — inclusive o projeto do aceite e os PDFs, que não caem em cascata. */
async function limpar() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { contains: TAG } }, select: { id: true } });
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return;

  const projetos = await prisma.projeto.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });
  if (projetos.length > 0) {
    await prisma.notificacao.deleteMany({ where: { href: { in: projetos.map((p) => `/projetos/${p.id}`) } } });
    await prisma.proposta.updateMany({ where: { projetoId: { in: projetos.map((p) => p.id) } }, data: { projetoId: null } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos.map((p) => p.id) } } });
  }
  const props = await prisma.proposta.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });
  const comPdf = await prisma.propostaVersao.findMany({
    where: { propostaId: { in: props.map((p) => p.id) }, pdfPath: { not: null } },
    select: { pdfPath: true },
  });
  for (const v of comPdf) await removerArquivo(v.pdfPath!);
  await prisma.notificacao.deleteMany({ where: { href: { in: props.map((p) => `/comercial/propostas/${p.id}`) } } });
  await prisma.proposta.deleteMany({ where: { clienteId: { in: ids } } });
  // SQL cru: o deleteMany do Prisma passa pela extensão de soft delete e deixaria negociação para trás.
  await prisma.$executeRawUnsafe(`DELETE FROM negociacao WHERE "clienteId" = ANY($1::text[])`, ids);
  // A timeline (Atividade) referencia o cliente e não cai em cascata.
  await prisma.atividade.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await limpar(); // resíduo de uma rodada anterior que morreu no meio
  const autor = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  const modelo = await prisma.modeloProposta.findUnique({ where: { slug: "multidisciplinar" }, select: { id: true } });
  if (!autor || !modelo) throw new Error("dev sem admin ou modelo semeado — rode npm run db:seed");

  empresaSalva = await prisma.configSistema.findUnique({ where: { chave: CHAVE_DADOS_EMPRESA } });
  const cliente = await prisma.cliente.create({ data: { nome: `${TAG}_Empresa`, tipo: "PJ" }, select: { id: true } });
  const negociacao = await prisma.negociacao.create({
    data: { titulo: `${TAG} negociação`, clienteId: cliente.id, estagio: "ORCAMENTO", valorEstimado: 0 },
    select: { id: true },
  });

  try {
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
    check("o escopo entra por disciplina contratada (estrutural + PCI)", (p1?.secoes ?? []).filter((s) => s.secao === "escopo").length === 2);

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
    check("obra em PE recebe o COSCIP", secoesPE.some((s) => s.clausula?.slug === "escopo-pci-pe"));

    console.log("\n── documento: o que impede publicar ─────────────────────────\n");
    await prisma.configSistema.deleteMany({ where: { chave: CHAVE_DADOS_EMPRESA } });
    const semEmpresa = await carregarDocumentoProposta(criada.propostaId);
    check("sem Configurações → Empresa, o documento é impedido", (semEmpresa?.impedimentos ?? []).some((m) => /Empresa/.test(m)));

    await prisma.configSistema.upsert({
      where: { chave: CHAVE_DADOS_EMPRESA },
      create: { chave: CHAVE_DADOS_EMPRESA, valor: EMPRESA_SMOKE },
      update: { valor: EMPRESA_SMOKE },
    });
    const doc = await carregarDocumentoProposta(criada.propostaId);
    check("com a empresa configurada, o documento monta sem impedimento", (doc?.impedimentos ?? []).length === 0, (doc?.impedimentos ?? []).join(" | "));
    check("o total sai por extenso, calculado do número", String(doc?.escalar.TotalExtenso) === "cem mil reais", String(doc?.escalar.TotalExtenso));
    check(
      "o plano de pagamento traz percentual, valor e extenso",
      String(doc?.escalar.PlanoPagamento).split("\n").length === 3 && String(doc?.escalar.PlanoPagamento).includes("quarenta mil reais"),
    );
    check("os dados bancários vêm do cadastro, não da proposta", String(doc?.escalar.DadosBancarios).includes("Banco Teste"));
    check("as seções viram as linhas da banda de detalhe", (doc?.porFonte["proposta-secoes"].linhas.length ?? 0) > 0);
    check("os tokens dentro da cláusula foram resolvidos", !JSON.stringify(doc?.porFonte).includes("[Cidade]"));
    check("usa o layout salvo no Estúdio (semeado), não o de fábrica", doc?.modeloDeFabrica === false);

    console.log("\n── plano que não fecha 100% ─────────────────────────────────\n");
    const secoesAtuais = await prisma.propostaSecao.findMany({ where: { propostaId: criada.propostaId }, orderBy: { ordem: "asc" } });
    const salvar = (parcelas: { descricao: string; percentual: number }[]) =>
      salvarPropostaComposta(
        {
          id: criada.propostaId,
          titulo: "SMOKE — projetos",
          obraEndereco: "Rua do Smoke, 1",
          obraCidade: "Maceió",
          obraUF: "AL",
          areaM2: 800,
          // O editor sempre manda a validade; omitir zera (é o estado que a guarda de envio
          // pega: o documento cita a validade).
          validade: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
          itens: [
            { disciplina: "Estrutural", valor: 60_000 },
            { disciplina: "Incêndio (PPCI)", valor: 40_000 },
          ],
          secoes: secoesAtuais.map((x) => ({ secao: x.secao, titulo: x.titulo ?? undefined, texto: x.texto })),
          parcelas,
        },
        autor.id,
      );

    await salvar([
      { descricao: "Sinal", percentual: 50 },
      { descricao: "Entrega", percentual: 60 },
    ]);
    check("rascunho com 110% É SALVO (quem monta adiciona uma parcela por vez)", true);
    const docQuebrado = await carregarDocumentoProposta(criada.propostaId);
    check(
      "mas o documento fica impedido enquanto não fechar 100%",
      (docQuebrado?.impedimentos ?? []).some((m) => m.includes("110%")),
      (docQuebrado?.impedimentos ?? []).join(" | "),
    );
    await recusa("e o envio é recusado com a mesma regra", () => garantirPropostaEnviavel(criada.propostaId), /110%/);
    check("cada salvamento gera uma versão", (await prisma.propostaVersao.count({ where: { propostaId: criada.propostaId } })) === 2);

    console.log("\n── envio: a mesma guarda vale para o e-mail e para o status ──\n");
    // `garantirPropostaEnviavel` é o que `enviarPropostaEmail` e `mudarStatusProposta("enviada")`
    // chamam. Antes só este smoke a chamava — nada bloqueava enviar uma composta com plano em 110%.
    await recusa(
      "proposta sem os dados da obra é recusada (o layout cita endereço e área)",
      () => garantirPropostaEnviavel(emPE.propostaId),
      /em branco|Endereço|Área/i,
    );

    await salvar([
      { descricao: "Sinal", percentual: 50 },
      { descricao: "Entrega", percentual: 50 },
    ]);
    let liberada = true;
    let motivo = "";
    try {
      await garantirPropostaEnviavel(criada.propostaId);
    } catch (e) {
      liberada = false;
      motivo = (e as Error).message;
    }
    check("com o plano em 100%, a obra e a empresa preenchidos, a proposta é LIBERADA para envio", liberada, motivo);

    console.log("\n── aceite: a composta vira projeto como qualquer proposta ────\n");
    const aceite = await aceitarProposta(criada.propostaId, autor.id);
    const projeto = await prisma.projeto.findUnique({
      where: { id: aceite.projetoId },
      include: { disciplinas: { select: { disciplinaTextoLegado: true } } },
    });
    check("o aceite cria o projeto com as disciplinas dos itens", projeto?.disciplinas.length === 2, projeto?.disciplinas.map((d) => d.disciplinaTextoLegado).join(", "));
    check("o valor do contrato é o total da versão", Number(projeto?.valorContrato) === 100_000, String(projeto?.valorContrato));
    const aceita = await prisma.proposta.findUnique({ where: { id: criada.propostaId }, select: { status: true, projetoId: true } });
    check("a proposta fica aceita e ligada ao projeto", aceita?.status === "aceita" && aceita.projetoId === aceite.projetoId);
    await recusa("proposta aceita não é mais editável", () => salvar([{ descricao: "Único", percentual: 100 }]), /aceita/i);
  } finally {
    console.log("\n── limpeza ──────────────────────────────────────────────────\n");
    await restaurarEmpresa();
    await limpar();
  }
  check("nenhum resíduo do smoke ficou no banco", (await prisma.cliente.count({ where: { nome: { contains: TAG } } })) === 0);

  console.log(`\n${ok ? "✔ Proposta composta: tudo verde." : "✖ Proposta composta: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
  await prisma.$disconnect();
}

main();
