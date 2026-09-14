/**
 * Preenche, direto no banco, os dados de Configurações → Empresa que o Termo de Uso usa
 * (razão social, CNPJ, endereço, encarregado de dados e foro), perguntando cada valor na hora.
 *
 * Existe para o deploy do termo v2026-09-14: o gate do termo bloqueia TODO mundo (admin
 * inclusive) antes de chegar em /configuracoes/empresa, e os campos "Encarregado de dados" e
 * "Foro" só existem na tela a partir desse deploy. Sem este script, o primeiro acesso pós-deploy
 * obrigaria a aceitar um termo com colchetes — e o aceite fica registrado como prova.
 *
 * Ordem no servidor:
 *   1. git pull                              (traz este script; o serviço antigo segue no ar)
 *   2. npm run empresa:dados-termo           (este script)
 *   3. deploy pelo menu (opção 10)           (o git pull dele vira no-op)
 * Não deixe ninguém salvar a tela de Empresa entre 2 e 3: a versão antiga da tela regrava o
 * registro sem os campos novos.
 *
 * Seguro com o código antigo em produção: só lê/grava a linha `empresa.dados` de
 * `config_sistema` (JSON). Faz merge — preserva logo e qualquer outra chave já salva.
 * Enter mantém o valor atual. Nada é gravado sem digitar SIM no final. Registra AuditLog.
 *
 * Uso: npm run empresa:dados-termo
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { prisma } from "../src/lib/prisma";
import { camposTermoPendentes, preencherMarcadoresEmpresa, type EmpresaTermo } from "../src/modules/legal/marcadores-empresa";
import { TERMOS } from "../src/modules/legal/termos";

const CHAVE = "empresa.dados"; // = CHAVE_DADOS_EMPRESA (queries.ts é server-only, não importa aqui)

type Campo = { chave: keyof EmpresaTermo; rotulo: string; dica: string };

/** Todos obrigatórios: qualquer um vazio deixa colchetes no termo. */
const CAMPOS: Campo[] = [
  { chave: "razaoSocial", rotulo: "Razão social", dica: "Ex.: Sena Estruturas Engenharia Ltda." },
  { chave: "cnpj", rotulo: "CNPJ", dica: "00.000.000/0001-00" },
  { chave: "endereco", rotulo: "Endereço", dica: "Rua, número, bairro, cidade/UF, CEP — numa linha" },
  { chave: "encarregadoDados", rotulo: "Encarregado de dados (DPO)", dica: "Nome e e-mail" },
  { chave: "foro", rotulo: "Foro (comarca/UF)", dica: "Ex.: Goiânia/GO" },
];

/**
 * Pergunta e espera a próxima linha. Fila própria em vez de `readline/promises`: com entrada
 * redirecionada (pipe) o readline lê tudo e fecha antes das perguntas; assim funciona igual no
 * terminal e em teste. Fim da entrada sem resposta → string vazia.
 */
function criarLeitor() {
  const rl = createInterface({ input: stdin, terminal: false });
  const linhas: string[] = [];
  const esperando: ((l: string) => void)[] = [];
  let fechado = false;
  rl.on("line", (l) => {
    const r = esperando.shift();
    if (r) r(l);
    else linhas.push(l);
  });
  rl.on("close", () => {
    fechado = true;
    for (const r of esperando.splice(0)) r("");
  });
  return {
    perguntar(prompt: string): Promise<string> {
      stdout.write(prompt);
      const pronta = linhas.shift();
      if (pronta !== undefined) {
        if (!stdin.isTTY) stdout.write(`${pronta}\n`); // eco quando a resposta veio de pipe
        return Promise.resolve(pronta);
      }
      if (fechado) return Promise.resolve("");
      return new Promise((resolve) => esperando.push(resolve));
    },
    acabou: () => fechado && linhas.length === 0,
    fechar: () => rl.close(),
  };
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function main() {
  const leitor = criarLeitor();
  try {
    const linha = await prisma.configSistema.findUnique({ where: { chave: CHAVE } });
    const atual: Record<string, unknown> =
      linha?.valor && typeof linha.valor === "object" && !Array.isArray(linha.valor)
        ? { ...(linha.valor as Record<string, unknown>) }
        : {};

    console.log("\nDados da empresa usados no Termo de Uso");
    console.log("Enter mantém o valor atual (entre colchetes).\n");

    const novo: Record<string, unknown> = { ...atual };
    for (const c of CAMPOS) {
      const valorAtual = texto(atual[c.chave]);
      if (c.chave === "razaoSocial" && valorAtual?.includes("DEV")) {
        console.log("  ⚠ A razão social atual parece dado fictício de desenvolvimento — substitua inteira.");
      }
      for (;;) {
        const prompt = `${c.rotulo} (${c.dica})${valorAtual ? ` [${valorAtual}]` : ""}: `;
        const final = (await leitor.perguntar(prompt)).trim() || valorAtual;
        if (final) {
          novo[c.chave] = final;
          break;
        }
        if (leitor.acabou()) throw new Error(`Entrada terminou sem "${c.rotulo}". Nada foi gravado.`);
        console.log("  → obrigatório para o termo não sair com colchetes.");
      }
    }

    const empresa = novo as unknown as EmpresaTermo;
    const linhasTermo = preencherMarcadoresEmpresa(TERMOS.colaborador.conteudo, empresa).split("\n");
    const trecho = (prefixo: string) => linhasTermo.find((l) => l.startsWith(prefixo)) ?? "";

    console.log("\n──── Como vai ficar no Termo de Uso (colaboradores) ────");
    console.log(trecho("Este Termo regula"));
    console.log(trecho("8.1.4."));
    console.log(trecho("13.1."));
    console.log("────────────────────────────────────────────────────────");
    const pendentes = camposTermoPendentes(empresa);
    if (pendentes.length > 0) console.log(`⚠ Ainda em branco: ${pendentes.join(", ")}`);

    const mudou = CAMPOS.some((c) => texto(atual[c.chave]) !== texto(novo[c.chave]));
    if (!mudou) {
      console.log("\nNada mudou — nada a gravar.");
      return;
    }

    const confirma = (await leitor.perguntar("\nGravar estes dados? Digite SIM para confirmar: ")).trim();
    if (confirma !== "SIM") {
      console.log("Cancelado. Nada foi gravado.");
      return;
    }

    await prisma.$transaction([
      prisma.configSistema.upsert({
        where: { chave: CHAVE },
        create: { chave: CHAVE, valor: novo as object },
        update: { valor: novo as object },
      }),
      // Sem sessão aqui (roda no terminal do servidor): AuditLog direto, sem `logAudit`
      // (que lê headers do Next). Mesma ação da tela, com a origem no detalhe.
      prisma.auditLog.create({
        data: {
          modulo: "configuracoes",
          acao: "salvar-dados-empresa",
          entidade: "ConfigSistema",
          entidadeId: CHAVE,
          detalhe: {
            origem: "scripts/definir-dados-empresa-termo.ts",
            antes: Object.fromEntries(CAMPOS.map((c) => [c.chave, texto(atual[c.chave])])),
            depois: Object.fromEntries(CAMPOS.map((c) => [c.chave, texto(novo[c.chave])])),
          },
        },
      }),
    ]);
    console.log("\n✔ Dados gravados. Pode seguir com o deploy.");
  } finally {
    leitor.fechar();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("✖ Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
