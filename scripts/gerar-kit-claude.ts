/**
 * Monta o kit de contexto para o Projeto do claude.ai de quem especifica (erro, melhoria, ferramenta).
 *
 * Saída: `kit-claude-saida/` na raiz (fora do git), pronta para subir no Projeto:
 *   - os arquivos fixos de `docs/kit-claude/` (instruções, contexto, modelos);
 *   - `05-ferramentas-existentes.md`, gerado do catálogo real (`modules/ferramentas/registry.ts`);
 *   - o manual do usuário (`docs/manual/`), um arquivo por seção;
 *   - as fichas de validação (`docs/engenharia/validacao/`);
 *   - `casos-de-teste-modelo.xlsx`, a planilha dos casos de teste.
 *
 * Só documentação de usuário entra: nada de código, `.env` ou docs de desenvolvimento.
 * Uso: `npm run kit:claude`. Regerar sempre que o manual ou as ferramentas mudarem.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { FERRAMENTAS, situacaoValidacao } from "../src/modules/ferramentas/registry";

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "kit-claude-saida");
const FONTE_KIT = path.join(RAIZ, "docs", "kit-claude");
const MANUAL = path.join(RAIZ, "docs", "manual");
const VALIDACAO = path.join(RAIZ, "docs", "engenharia", "validacao");

/** Pastas do manual que são registro interno da documentação, não conteúdo para o usuário. */
const PASTAS_FORA_DO_MANUAL = new Set(["deliberacoes", "decisions"]);

function semFrontmatter(texto: string): string {
  return texto.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

async function listarMd(pasta: string): Promise<string[]> {
  const nomes = await fs.readdir(pasta);
  return nomes.filter((n) => n.endsWith(".md")).sort();
}

/** Junta os .md de uma pasta num texto só, marcando de qual arquivo veio cada parte. */
async function juntar(pasta: string, prefixo: string, primeiro?: string): Promise<string> {
  const nomes = await listarMd(pasta);
  const ordem = primeiro && nomes.includes(primeiro) ? [primeiro, ...nomes.filter((n) => n !== primeiro)] : nomes;
  const partes: string[] = [];
  for (const nome of ordem) {
    const texto = await fs.readFile(path.join(pasta, nome), "utf8");
    partes.push(`<!-- arquivo: docs/manual/${prefixo}${nome} -->\n\n${semFrontmatter(texto)}`);
  }
  return partes.join("\n\n---\n\n");
}

async function copiarKitFixo(): Promise<number> {
  const nomes = (await listarMd(FONTE_KIT)).filter((n) => n !== "LEIAME.md");
  for (const nome of nomes) await fs.copyFile(path.join(FONTE_KIT, nome), path.join(SAIDA, nome));
  return nomes.length;
}

async function gerarManual(): Promise<number> {
  let n = 0;
  const cabecalho =
    "> Manual do usuário do SenaHub (o mesmo da tela Ajuda). Pode estar desatualizado em pontos: na dúvida, " +
    "marque \"a confirmar pela equipe\".\n\n";
  await fs.writeFile(path.join(SAIDA, "manual-00-geral.md"), cabecalho + (await juntar(MANUAL, "", "README.md")) + "\n");
  n++;
  const entradas = await fs.readdir(MANUAL, { withFileTypes: true });
  for (const e of entradas.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (PASTAS_FORA_DO_MANUAL.has(e.name)) continue;
    const texto = await juntar(path.join(MANUAL, e.name), `${e.name}/`, "README.md");
    if (!texto) continue;
    await fs.writeFile(path.join(SAIDA, `manual-${e.name}.md`), cabecalho + texto + "\n");
    n++;
  }
  return n;
}

async function copiarValidacao(): Promise<number> {
  const nomes = await listarMd(VALIDACAO);
  for (const nome of nomes) {
    const destino = nome.startsWith("manual-") ? `guia-${nome.replace(/^manual-/, "")}` : `ficha-validacao-${nome}`;
    await fs.copyFile(path.join(VALIDACAO, nome), path.join(SAIDA, destino));
  }
  return nomes.length;
}

const ROTULO_SITUACAO = {
  nao_exige: "em uso",
  validada: "em uso (validada)",
  em_validacao: "em validação (só a gestão das ferramentas vê)",
} as const;

async function gerarCatalogo(): Promise<void> {
  const linhas: string[] = [
    "# Ferramentas de engenharia que existem hoje",
    "",
    "Gerado do catálogo do sistema. Para pedir mudança numa delas, use o nome exato daqui no modelo de ferramenta.",
    "Ferramenta \"em validação\" tem ficha de validação neste Projeto (`ficha-validacao-*.md`).",
    "",
  ];
  const disciplinas = [...new Set(FERRAMENTAS.map((f) => f.disciplina))];
  for (const d of disciplinas) {
    linhas.push(`## ${d}`, "");
    for (const f of FERRAMENTAS.filter((x) => x.disciplina === d)) {
      const exporta = f.exportaveis.map((x) => x.toUpperCase()).join(", ") || "—";
      linhas.push(
        `### ${f.nome}`,
        "",
        f.descricao,
        "",
        `- Tipo: ${f.tipo === "completa" ? "Completa" : "Rápida"}`,
        `- Norma: ${f.norma ?? "—"}`,
        `- Exporta: ${exporta}`,
        `- Versão do cálculo: ${f.versaoCalc ?? 1}`,
        `- Situação: ${ROTULO_SITUACAO[situacaoValidacao(f)]}`,
        "",
      );
    }
  }
  await fs.writeFile(path.join(SAIDA, "05-ferramentas-existentes.md"), linhas.join("\n"));
}

const COLUNAS = [
  { header: "Caso", key: "caso", width: 7 },
  { header: "Tipo do caso", key: "tipo", width: 18 },
  { header: "Descrição do caso", key: "descricao", width: 40 },
  { header: "Entrada ou saída", key: "es", width: 14 },
  { header: "Grandeza / campo", key: "grandeza", width: 30 },
  { header: "Valor", key: "valor", width: 14 },
  { header: "Unidade", key: "unidade", width: 10 },
  { header: "Tolerância", key: "tolerancia", width: 14 },
  { header: "Como foi calculado / referência", key: "referencia", width: 40 },
  { header: "Observação", key: "obs", width: 30 },
];

const TIPOS_CASO = ["típico", "limite", "reprova ou alerta", "entrada inválida"];

function prepararAba(aba: ExcelJS.Worksheet, linhas: number) {
  aba.columns = COLUNAS;
  aba.getRow(1).font = { bold: true };
  aba.views = [{ state: "frozen", ySplit: 1 }];
  for (let r = 2; r <= linhas; r++) {
    aba.getCell(`B${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${TIPOS_CASO.join(",")}"`],
    };
    aba.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"entrada,saída"'] };
  }
}

async function gerarPlanilha(): Promise<void> {
  const wb = new ExcelJS.Workbook();

  const como = wb.addWorksheet("Como preencher");
  como.getColumn(1).width = 110;
  const instrucoes = [
    "Casos de teste de uma ferramenta de engenharia",
    "",
    "Um caso = um conjunto de entradas e os resultados esperados. Uma linha por grandeza (entrada ou saída).",
    "Todas as linhas do mesmo caso têm o mesmo número na coluna Caso.",
    "Os resultados esperados (linhas de saída) são calculados pelo engenheiro, à mão ou na planilha dele.",
    "Não use o resultado do assistente como esperado: o teste precisa ser independente do cálculo.",
    "",
    "Mínimo: 1 típico, 1 limite (troca de domínio, borda de tabela, faixa), 1 que reprova ou gera alerta, 1 de entrada inválida.",
    "Tolerância: quanto o sistema pode diferir do seu número (ex.: ± 0,01 A ou ± 0,5 %). Em branco = igual nas casas mostradas.",
    "Caso de entrada inválida: a saída esperada é a mensagem de recusa (coluna Valor com o texto).",
    "Alerta esperado: linha de saída com a grandeza \"alerta\" e o texto no Valor.",
    "",
    "A aba Exemplo mostra um caso real (Corrente e Demanda) preenchido.",
  ];
  instrucoes.forEach((t, i) => {
    const c = como.getCell(`A${i + 1}`);
    c.value = t;
    c.alignment = { wrapText: true };
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  const casos = wb.addWorksheet("Casos");
  prepararAba(casos, 300);

  const ex = wb.addWorksheet("Exemplo");
  prepararAba(ex, 20);
  const desc = "Chuveiro 5 500 W, 220 V monofásico, PVC, 40 °C, 3 circuitos agrupados";
  const exemplo = [
    [1, "típico", desc, "entrada", "Potência", 5500, "W", "", "", ""],
    [1, "típico", desc, "entrada", "Tensão", 220, "V", "", "", "monofásico"],
    [1, "típico", desc, "entrada", "Fator de potência", 1, "", "", "", ""],
    [1, "típico", desc, "entrada", "Temperatura ambiente", 40, "°C", "", "", "isolação PVC 70 °C"],
    [1, "típico", desc, "entrada", "Circuitos agrupados", 3, "", "", "", ""],
    [1, "típico", desc, "saída", "Corrente de projeto Ib", 25, "A", "± 0,01 A", "Ib = P ÷ (V · fp) = 5500 ÷ 220", ""],
    [1, "típico", desc, "saída", "FCT", 0.87, "", "", "NBR 5410, Tabela 40, PVC, 40 °C", ""],
    [1, "típico", desc, "saída", "FCA", 0.7, "", "", "NBR 5410, Tabela 42, 3 circuitos", ""],
    [1, "típico", desc, "saída", "Corrente corrigida Ib′", 41.05, "A", "± 0,01 A", "Ib′ = Ib ÷ (FCT · FCA) = 25 ÷ 0,609", ""],
  ];
  // `addRow` iria para depois das linhas já tocadas pela validação de lista: grava a partir da linha 2.
  exemplo.forEach((l, i) => {
    ex.getRow(i + 2).values = l;
  });

  await wb.xlsx.writeFile(path.join(SAIDA, "casos-de-teste-modelo.xlsx"));
}

async function main() {
  await fs.rm(SAIDA, { recursive: true, force: true });
  await fs.mkdir(SAIDA, { recursive: true });
  const fixos = await copiarKitFixo();
  await gerarCatalogo();
  const manual = await gerarManual();
  const fichas = await copiarValidacao();
  await gerarPlanilha();
  const arquivos = await fs.readdir(SAIDA);
  console.log(`Kit gerado em ${SAIDA}`);
  console.log(`  ${fixos} arquivos do kit + catálogo + ${manual} do manual + ${fichas} de validação + planilha`);
  console.log(`  total: ${arquivos.length} arquivos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
