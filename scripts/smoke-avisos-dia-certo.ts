/**
 * Smoke do dia certo dos avisos diários (`lib/jobs-handlers.ts`) contra o banco de dev: para cada
 * job que procura "daqui a exatamente N dias", cria um registro com a data de hoje+N e outro com
 * hoje+N+1 (meia-noite UTC, como o banco guarda a data), roda o handler e confere que SÓ o de
 * hoje+N recebeu o aviso. O antigo `diaAlvo` montava o dia em meia-noite LOCAL (03:00Z em São
 * Paulo) e pegava o registro do dia seguinte.
 *
 * Cobre: prazo de disciplina (D-7), inadimplência (D+1, sino interno), licitação (D-7), cotação
 * (D-3 e "sem resposta" D+1), vigência e garantia de contrato (primeiro dia configurado) e acesso
 * do cofre (D-30). Certidões têm o próprio smoke (`smoke:prazos-certidoes`). APAGA o que criou.
 *
 *   npm run smoke:avisos-dia-certo
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import {
  alertaAcessos,
  alertaCotacoesCusto,
  alertaInadimplencia,
  alertaLicitacoes,
  alertasPrazoDisciplina,
  alertaVencimentosContrato,
} from "@/lib/jobs-handlers";
import { getConfigLicitacoes } from "@/modules/licitacoes/config/queries";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

const MARCA = `smoke-dia-certo-${Date.now()}`;
/** Rótulo que vai no texto do registro e volta no texto da notificação. */
const rotulo = (r: string) => `${MARCA}:${r}`;

/** Rótulos (dos criados pelo smoke) citados em notificação desde `desde`. */
async function avisados(desde: Date): Promise<string[]> {
  const ns = await prisma.notificacao.findMany({
    where: {
      createdAt: { gte: desde },
      OR: [{ titulo: { contains: MARCA } }, { corpo: { contains: MARCA } }],
    },
    select: { titulo: true, corpo: true },
  });
  const achados = new Set<string>();
  const re = new RegExp(`${MARCA}:([\\w+-]+)`, "g");
  for (const n of ns) {
    for (const m of `${n.titulo} ${n.corpo ?? ""}`.matchAll(re)) achados.add(m[1]);
  }
  return [...achados].sort();
}

/** O par (certo, errado) de um job: só o certo pode ter sido avisado. */
function conferir(lista: string[], certo: string, errado: string, oQue: string) {
  ok(
    lista.includes(certo) && !lista.includes(errado),
    `${oQue}: avisa ${certo}, não ${errado} (avisados: ${lista.filter((r) => r === certo || r === errado).join(", ") || "nenhum"})`,
  );
}

/** Roda os jobs reais sobre o banco inteiro (notifica gente de verdade): só em banco de dev. */
function exigirBancoDeDev() {
  let nome = "";
  try {
    nome = new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "");
  } catch {
    /* cai na recusa abaixo */
  }
  if (!/(_remake|_dev|_test|_vscode)$/i.test(nome) || process.env.NODE_ENV === "production") {
    throw new Error(`RECUSADO: o banco "${nome}" não parece de DEV. O smoke roda os avisos diários de verdade.`);
  }
}

async function main() {
  exigirBancoDeDev();
  const usuario = await prisma.user.findFirst({
    where: { ativo: true, tipo: "interno", superUsuario: true },
    select: { id: true },
  });
  if (!usuario) throw new Error("Nenhum superusuário interno ativo no banco de dev (é ele quem recebe os avisos).");

  const hoje = inicioDoDiaUtc();
  const em = (dias: number) => new Date(hoje.getTime() + dias * 86_400_000);
  const cfgLic = await getConfigLicitacoes();
  // Primeiro dia configurado do contrato cujo dia seguinte NÃO é outro dia configurado (senão o
  // registro de N+1 seria avisado de direito, como "N+1 dias").
  const diasContrato = cfgLic.datasChave.alertaDiasPadrao;
  const nContrato = diasContrato.find((d) => d >= 0 && !diasContrato.includes(d + 1));

  const criados = {
    clienteId: null as string | null,
    projetoId: null as string | null,
    lancamentos: [] as string[],
    licitacoes: [] as string[],
    rfqs: [] as string[],
    fornecedorId: null as string | null,
    contratos: [] as string[],
    categoriaCredencialId: null as string | null,
    credenciais: [] as string[],
  };

  try {
    // ── Prazo de disciplina (D-7): Disciplina.prazo é DateTime gravado em meia-noite UTC ──
    const cliente = await prisma.cliente.create({ data: { nome: `${MARCA}-cliente` } });
    criados.clienteId = cliente.id;
    const projeto = await prisma.projeto.create({
      data: {
        codigo: `${Date.now()}`.slice(-6),
        ano: new Date().getFullYear(),
        sequencial: Number(`${Date.now()}`.slice(-5)),
        nome: `${MARCA}-projeto`,
        clienteId: cliente.id,
      },
    });
    criados.projetoId = projeto.id;
    for (const [r, dias] of [["disc+7", 7], ["disc+8", 8]] as const) {
      await prisma.disciplina.create({
        data: { projetoId: projeto.id, disciplinaTextoLegado: rotulo(r), prazo: em(dias) },
      });
    }

    // ── Inadimplência (D+1): Lancamento.vencimento @db.Date ──
    const catReceita = await prisma.categoriaFinanceira.findFirst({
      where: { tipo: "receita", natureza: "resultado", ativo: true },
      select: { id: true },
    });
    if (!catReceita) throw new Error("Nenhuma categoria de receita de resultado ativa no banco de dev.");
    for (const [r, dias] of [["inad-1", -1], ["inad0", 0]] as const) {
      const l = await prisma.lancamento.create({
        data: {
          tipo: "receita",
          status: "previsto",
          descricao: rotulo(r),
          valor: 100,
          data: hoje,
          vencimento: em(dias),
          categoriaId: catReceita.id,
          autorId: usuario.id,
        },
      });
      criados.lancamentos.push(l.id);
    }

    // ── Licitação (D-7): prazoProposta @db.Date ──
    for (const [r, dias] of [["lic+7", 7], ["lic+8", 8]] as const) {
      const l = await prisma.licitacao.create({
        data: { titulo: rotulo(r), status: "em_andamento", prazoProposta: em(dias) },
      });
      criados.licitacoes.push(l.id);
    }

    // ── Cotação (D-3 e "sem resposta" D+1): prazoResposta @db.Date ──
    const fornecedor = await prisma.custoFornecedor.create({ data: { nome: `${MARCA}-fornecedor` } });
    criados.fornecedorId = fornecedor.id;
    for (const [r, dias, convite] of [
      ["rfq+3", 3, false],
      ["rfq+4", 4, false],
      ["rfqsr-1", -1, true],
      ["rfqsr0", 0, true],
    ] as const) {
      const rfq = await prisma.custoRfq.create({
        data: {
          titulo: rotulo(r),
          status: "aberta",
          prazoResposta: em(dias),
          criadoPorId: usuario.id,
          ...(convite ? { convites: { create: { fornecedorId: fornecedor.id } } } : {}),
        },
      });
      criados.rfqs.push(rfq.id);
    }

    // ── Contrato (vigência e garantia no 1º dia configurado): @db.Date ──
    if (nContrato !== undefined) {
      for (const [r, dias, campo] of [
        [`vig+${nContrato}`, nContrato, "vigenciaFim"],
        [`vig+${nContrato + 1}`, nContrato + 1, "vigenciaFim"],
        [`gar+${nContrato}`, nContrato, "garantiaValidade"],
        [`gar+${nContrato + 1}`, nContrato + 1, "garantiaValidade"],
      ] as const) {
        const lic = await prisma.licitacao.create({
          data: {
            titulo: rotulo(r),
            status: "em_execucao",
            contrato: { create: { valorHomologado: 1000, [campo]: em(dias) } },
          },
          include: { contrato: { select: { id: true } } },
        });
        criados.licitacoes.push(lic.id);
        if (lic.contrato) criados.contratos.push(lic.contrato.id);
      }
    }

    // ── Acesso do cofre (D-30): vencimentoEm @db.Date ──
    const cat = await prisma.credencialCategoria.create({ data: { nome: `${MARCA}-cat` } });
    criados.categoriaCredencialId = cat.id;
    for (const [r, dias] of [["acesso+30", 30], ["acesso+31", 31]] as const) {
      const c = await prisma.credencial.create({
        data: { nome: rotulo(r), categoriaId: cat.id, responsavelId: usuario.id, vencimentoEm: em(dias) },
      });
      criados.credenciais.push(c.id);
    }

    // ── Roda os jobs ──
    const inicio = new Date();
    await alertasPrazoDisciplina();
    await alertaInadimplencia();
    await alertaLicitacoes();
    await alertaCotacoesCusto();
    await alertaVencimentosContrato();
    await alertaAcessos();
    const lista = await avisados(inicio);
    console.log(`  (hoje = ${hoje.toISOString().slice(0, 10)}; avisados: ${lista.join(", ") || "nenhum"})`);

    conferir(lista, "disc+7", "disc+8", "Prazo de disciplina D-7");
    conferir(lista, "inad-1", "inad0", "Inadimplência D+1 (vencido ontem, não o que vence hoje)");
    conferir(lista, "lic+7", "lic+8", "Licitação D-7");
    conferir(lista, "rfq+3", "rfq+4", "Cotação D-3");
    conferir(lista, "rfqsr-1", "rfqsr0", "Cotação sem resposta D+1 (prazo de ontem, não o de hoje)");
    if (nContrato !== undefined) {
      conferir(lista, `vig+${nContrato}`, `vig+${nContrato + 1}`, `Vigência de contrato D-${nContrato}`);
      conferir(lista, `gar+${nContrato}`, `gar+${nContrato + 1}`, `Garantia de contrato D-${nContrato}`);
    } else {
      console.log("  (contrato pulado: nenhum dia configurado sem o dia seguinte também configurado)");
    }
    conferir(lista, "acesso+30", "acesso+31", "Acesso do cofre D-30");

    // Rodar de novo não repete o sino da inadimplência (chave por recebível + vencimento).
    const segunda = new Date();
    await alertaInadimplencia();
    ok(!(await avisados(segunda)).includes("inad-1"), "Inadimplência: rodar de novo não repete o sino");
  } finally {
    await prisma.notificacao.deleteMany({
      where: { OR: [{ titulo: { contains: MARCA } }, { corpo: { contains: MARCA } }] },
    });
    for (const id of criados.contratos) {
      await prisma.alertaLicitacaoEnviado.deleteMany({ where: { chave: { contains: id } } });
    }
    await prisma.credencial.deleteMany({ where: { id: { in: criados.credenciais } } });
    if (criados.categoriaCredencialId) {
      await prisma.credencialCategoria.deleteMany({ where: { id: criados.categoriaCredencialId } });
    }
    await prisma.contratoLicitacao.deleteMany({ where: { id: { in: criados.contratos } } });
    await prisma.licitacao.deleteMany({ where: { id: { in: criados.licitacoes } } });
    await prisma.custoRfq.deleteMany({ where: { id: { in: criados.rfqs } } });
    if (criados.fornecedorId) await prisma.custoFornecedor.deleteMany({ where: { id: criados.fornecedorId } });
    await prisma.lancamento.deleteMany({ where: { id: { in: criados.lancamentos } } });
    if (criados.projetoId) {
      await prisma.disciplina.deleteMany({ where: { projetoId: criados.projetoId } });
      await prisma.projeto.deleteMany({ where: { id: criados.projetoId } });
    }
    if (criados.clienteId) await prisma.cliente.deleteMany({ where: { id: criados.clienteId } });
  }

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
