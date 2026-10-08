/**
 * Smoke do "Atualize seus dados" contra o banco de dev. Esvazia três campos de uma pessoa CLT,
 * abre o pedido, preenche pelo mesmo código da tela e confere faixa, aprovação de CPF e fechamento.
 * DEVOLVE a pessoa como estava (campos, preferências) e apaga pedidos e avisos criados.
 *
 *   npm run smoke:pedido-dados
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  confirmarMeusDadosNoBanco,
  criarReconfirmacoesAnuais,
  faixaDoUsuario,
  fecharSeAtendido,
  preencherDadosNoBanco,
  preenchimentosPendentes,
  situacaoDaPessoa,
} from "@/modules/rh/cadastro/pedido-service";

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};
async function recusa(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const CAMPOS = { telefone: true, cpf: true, enderecoBairro: true } as const;
/** Tudo o que o smoke pode tocar — restaurado no fim. */
const TODOS = {
  nomeCompleto: true, cpf: true, rg: true, dataNascimento: true, telefone: true, enderecoCep: true, enderecoLogradouro: true,
  enderecoNumero: true, enderecoComplemento: true, enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
} as const;
const VALOR_DE_TESTE: Record<string, string> = {
  nomeCompleto: "Pessoa de Teste do Smoke", rg: "1234567", dataNascimento: "1990-01-01", telefone: "81988887777",
  enderecoCep: "50000-000", enderecoLogradouro: "Rua do Smoke", enderecoNumero: "1", enderecoComplemento: "",
  enderecoBairro: "Centro", enderecoCidade: "Recife", enderecoUf: "PE",
};

async function main() {
  const inicio = new Date();
  const pessoa = await prisma.user.findFirst({
    where: { ativo: true, role: { in: ["clt", "estagiario"] }, pedidosDados: { none: { status: "aberto" } } },
    select: { id: true, name: true, ...TODOS, dadosConfirmadosEm: true, preference: { select: { dados: true } } },
  });
  if (!pessoa) throw new Error("Nenhuma pessoa CLT/estágio ativa sem pedido aberto no banco de dev.");
  const rh = await prisma.user.findFirst({ where: { ativo: true, role: "admin" }, select: { id: true } });
  console.log(`Pessoa de teste: ${pessoa.name}`);
  const dadosAntes = pessoa.preference?.dados ?? null;

  try {
    await prisma.user.update({ where: { id: pessoa.id }, data: { telefone: null, cpf: null, enderecoBairro: null } });

    const antes = await situacaoDaPessoa(pessoa.id);
    const campos = antes?.aPreencher.map((c) => c.campo) ?? [];
    ok(["telefone", "cpf", "enderecoBairro"].every((c) => campos.includes(c)), "campos esvaziados aparecem para preencher");
    ok(!campos.some((c) => ["cargoId", "salario", "dataAdmissao"].includes(c)), "campos do RH nunca aparecem para a pessoa");

    ok((await faixaDoUsuario(pessoa.id)) === null, "sem pedido aberto, sem faixa");
    const pedido = await prisma.pedidoDadosCadastro.create({
      data: { userId: pessoa.id, solicitadoPorId: rh?.id ?? pessoa.id, prazo: new Date("2020-01-01T00:00:00Z") },
    });
    const faixa = await faixaDoUsuario(pessoa.id);
    ok(!!faixa && faixa.texto.includes("completar seus dados"), "pedido aberto → faixa no topo");
    ok(faixa?.vencido === true, "prazo passado → faixa em destaque");
    const p2002 = await recusa(() => prisma.pedidoDadosCadastro.create({ data: { userId: pessoa.id, solicitadoPorId: pessoa.id } }));
    ok(!!p2002 && /unique|Unique/.test(p2002), "índice parcial recusa um segundo pedido aberto");

    const invalido = await recusa(() => preencherDadosNoBanco(pessoa, { cpf: "111.111.111-11" }));
    ok(invalido === "CPF inválido." || !!invalido, `CPF inválido é recusado (${invalido})`);

    const r = await preencherDadosNoBanco(pessoa, {
      telefone: "81988887777",
      cpf: "529.982.247-25",
      enderecoBairro: "Boa Viagem",
      cargoId: "x",
    });
    ok(r.aplicados === 2 && r.paraValidar === 1, `telefone e bairro valem na hora, CPF vai ao RH (${r.aplicados}/${r.paraValidar})`);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: pessoa.id }, select: CAMPOS });
    ok(depois.telefone === "(81) 98888-7777" && depois.enderecoBairro === "Boa Viagem", "valores gravados no formato padrão");
    ok(depois.cpf === null, "CPF não entra no cadastro antes da aprovação");
    ok((await preenchimentosPendentes(pessoa.id)).cpf === "529.982.247-25", "CPF guardado na fila do RH");

    const situacao = await situacaoDaPessoa(pessoa.id);
    ok(situacao?.aguardandoRh.includes("CPF") === true, "CPF aparece como aguardando o RH");
    ok(!situacao?.aPreencher.some((c) => c.campo === "cpf"), "CPF some do formulário enquanto espera");

    const status = (await prisma.pedidoDadosCadastro.findUniqueOrThrow({ where: { id: pedido.id } })).status;
    const esperado = situacao && situacao.pendenteDaPessoa === 0 ? "atendido" : "aberto";
    ok(status === esperado, `pedido ${status} — ${situacao?.pendenteDaPessoa ?? 0} pendência(s) da pessoa restante(s)`);
    if (status === "aberto") {
      ok((await fecharSeAtendido(pessoa.id)) === false, "pedido com pendência da pessoa não fecha");
      // Preenche TUDO o que ainda falta: sem conta bancária faltando, o pedido fecha sozinho.
      const resto = Object.fromEntries((situacao?.aPreencher ?? []).map((c) => [c.campo, VALOR_DE_TESTE[c.campo] ?? ""]));
      const r2 = await preencherDadosNoBanco(pessoa, resto);
      const final = await situacaoDaPessoa(pessoa.id);
      if (final?.contaBancaria === "falta") {
        ok(!r2.atendido, "só falta a conta bancária: o pedido segue aberto (conta tem fluxo próprio)");
        // Proposta de conta enviada (simulada no blob da pessoa) → nada mais depende dela.
        const pref = await prisma.userPreference.findUniqueOrThrow({ where: { userId: pessoa.id }, select: { dados: true } });
        const dados = { ...((pref.dados as Record<string, unknown>) ?? {}), contaPendente: { tipo: "criar", dados: {}, propostoEm: new Date().toISOString() } };
        await prisma.userPreference.update({ where: { userId: pessoa.id }, data: { dados: dados as Prisma.InputJsonObject } });
        ok((await fecharSeAtendido(pessoa.id)) === true, "proposta de conta enviada → pedido atendido");
        ok((await faixaDoUsuario(pessoa.id)) === null, "pedido atendido → faixa some");
        ok((await fecharSeAtendido(pessoa.id)) === false, "fechar de novo não faz nada (sem pedido aberto)");
      } else {
        ok(r2.atendido, "tudo preenchido → pedido atendido na hora");
        ok((await faixaDoUsuario(pessoa.id)) === null, "pedido atendido → faixa some");
      }
    } else {
      ok((await faixaDoUsuario(pessoa.id)) === null, "pedido atendido → faixa some");
    }
    // ── Reconfirmação anual ──
    await prisma.pedidoDadosCadastro.deleteMany({ where: { userId: pessoa.id, criadoEm: { gte: inicio } } });
    await prisma.user.update({ where: { id: pessoa.id }, data: { dadosConfirmadosEm: null } });
    await criarReconfirmacoesAnuais();
    ok((await prisma.pedidoDadosCadastro.count({ where: { userId: pessoa.id, status: "aberto" } })) === 0, "quem nunca confirmou não recebe reconfirmação automática");
    await prisma.user.update({ where: { id: pessoa.id }, data: { dadosConfirmadosEm: new Date(Date.now() - 400 * 86_400_000) } });
    await criarReconfirmacoesAnuais();
    const reconf = await prisma.pedidoDadosCadastro.findFirst({ where: { userId: pessoa.id, status: "aberto" } });
    ok(reconf?.tipo === "reconfirmar", "confirmou há mais de um ano: reconfirmação aberta sozinha");
    ok((await faixaDoUsuario(pessoa.id))?.href === "/minha-ficha?confirmar=1", "faixa leva para conferir os dados");
    ok((await confirmarMeusDadosNoBanco(pessoa.id)).atendido, "\"Está tudo certo\" fecha a reconfirmação");
    ok((await faixaDoUsuario(pessoa.id)) === null, "confirmado: a faixa some");
  } finally {
    const original = { ...Object.fromEntries(Object.keys(TODOS).map((k) => [k, pessoa[k as keyof typeof TODOS]])), dadosConfirmadosEm: pessoa.dadosConfirmadosEm };
    await prisma.user.update({ where: { id: pessoa.id }, data: original });
    if (dadosAntes === null) await prisma.userPreference.updateMany({ where: { userId: pessoa.id }, data: { dados: {} } });
    else await prisma.userPreference.update({ where: { userId: pessoa.id }, data: { dados: dadosAntes as Prisma.InputJsonValue } });
    await prisma.pedidoDadosCadastro.deleteMany({ where: { userId: pessoa.id, criadoEm: { gte: inicio } } });
    await prisma.notificacao.deleteMany({
      where: { createdAt: { gte: inicio }, OR: [{ titulo: "Dados de cadastro para validar" }, { titulo: "Dados atualizados" }, { titulo: "Confira seus dados de cadastro" }] },
    });
    console.log("(limpeza: pessoa restaurada, pedidos e avisos de teste apagados)");
  }

  console.log(falhas === 0 ? "\nSMOKE OK" : `\nSMOKE FALHOU (${falhas})`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
