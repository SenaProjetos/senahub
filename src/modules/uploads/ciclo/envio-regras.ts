/**
 * Verificações do "Enviar para análise" (A4 + D9). PURO: recebe a leitura do nome feita pelo motor
 * de nomenclatura (`interpretarNomeArquivo`) e os arquivos da revisão, e devolve TODOS os problemas de
 * uma vez, cada um dizendo o que corrigir — corrigir um por vez, reenviando, é o que a lista evita.
 *
 * Lista fixa para todos os projetos (decisão do dono), exceto o projeto em "Nomenclatura livre": nele o
 * nome segue o padrão de outro dono e as verificações do nome ficam de fora (`nomenclaturaLivre`). Os metadados vêm do nome, do carimbo e da
 * detecção; o único campo digitado é a descrição da revisão, obrigatória da R01 em diante.
 *
 * A conferência com o CARIMBO (código e revisão) não está aqui: só entra depois de o dono ver exemplos
 * reais da leitura (spec, "Em aberto").
 */
import { rotuloRevisao } from "@/lib/utils";
import type { Interpretacao } from "@/modules/uploads/nomenclatura/interpretar";
import { ehDocumentoDeModelo } from "./escopo";

export type ArquivoParaEnvio = { nome: string; ext: string; hash: string };

export type EntradaEnvio = {
  /** Número interno da revisão (1 = R00). */
  numero: number;
  descricao: string | null;
  arquivos: readonly ArquivoParaEnvio[];
  /** Arquivos que valiam na revisão anterior do documento (para o hash), por extensão. */
  anteriores: readonly ArquivoParaEnvio[];
  /** Leitura do nome do documento pelo motor, com o padrão da versão de nomenclatura do projeto. */
  nome: Pick<Interpretacao, "casouPadrao" | "projeto" | "disciplina" | "fase" | "tipo" | "numero" | "revisao" | "avisos">;
  /** Campos que o padrão do projeto tem (`{disc}`, `{fase}`, `{tipo}`…). Vazio = projeto sem modelo (v1). */
  camposDoPadrao: readonly string[];
  /** O modelo do padrão, para a mensagem ("{proj}-SENA-{disc}-…"). */
  modelo: string | null;
  /** Código do projeto como está cadastrado (`260027`). Ausente = não confere o formato. */
  codigoProjeto?: string;
  /**
   * Projeto em "Nomenclatura livre" (`NomenclaturaConfig.exigir = false`): o nome segue o padrão de
   * outro dono (licitação segue o do órgão), então nada do que se lê do NOME bloqueia o envio.
   */
  nomenclaturaLivre?: boolean;
};

const primeirosDigitos = (texto: string) => texto.match(/\d+/)?.[0] ?? "";

/** Extensões de desenho: com uma delas na revisão, o PDF passa a ser obrigatório. */
const EXTENSOES_DE_DESENHO = ["dwg", "dxf", "rvt"];

export function temDesenho(extensoes: readonly string[]): boolean {
  return extensoes.some((e) => EXTENSOES_DE_DESENHO.includes(e.toLowerCase()));
}

export const MOTIVO_DESENHO_SEM_PDF = "A revisão tem desenho e precisa ter o PDF dele.";

export const PRECISA_DESCRICAO_A_PARTIR_DE = 2;

/** O que se confere no NOME do arquivo — desligado quando o projeto está em nomenclatura livre. */
function problemasDoNome(e: EntradaEnvio): string[] {
  const problemas: string[] = [];
  const { nome } = e;

  // Nome fora do padrão. Com modelo (v2): tem de casar. Sem modelo (v1): a estrutura mínima — código do
  // projeto, disciplina e número da prancha lidos com confiança.
  if (nome.casouPadrao === false) {
    problemas.push(`O nome não segue o padrão do projeto${e.modelo ? ` (${e.modelo})` : ""}. Renomeie o arquivo e envie de novo.`);
  } else if (nome.casouPadrao === null && (!nome.projeto || !nome.disciplina || !nome.numero)) {
    problemas.push("O nome não segue a nomenclatura: precisa do código do projeto, da disciplina e do número da prancha.");
  }

  // Siglas fora do catálogo (disciplina/sub, etapa, tipo) — o motor diz qual.
  for (const aviso of nome.avisos.filter((a) => a.tipo === "sigla_desconhecida")) problemas.push(aviso.texto);
  // Campo que o padrão exige e não foi lido (casou a forma, mas a sigla não existe).
  const faltando: [string, unknown, string][] = [
    ["disc", nome.disciplina, "a disciplina"],
    ["fase", nome.fase, "a etapa"],
    ["tipo", nome.tipo, "o tipo"],
  ];
  if (nome.casouPadrao === true && !nome.avisos.some((a) => a.tipo === "sigla_desconhecida")) {
    for (const [campo, valor, rotulo] of faltando) {
      if (e.camposDoPadrao.includes(campo) && !valor) problemas.push(`Não foi possível ler ${rotulo} no nome do arquivo.`);
    }
  }

  if (nome.projeto && !nome.projeto.bateComAtual) {
    problemas.push(`O código do projeto no nome (${nome.projeto.texto.trim()}) não é o deste projeto.`);
  } else if (nome.projeto && e.codigoProjeto && primeirosDigitos(nome.projeto.texto) !== primeirosDigitos(e.codigoProjeto)) {
    // O motor lê "26027" como o projeto 260027 (ano 26, nº 27). É erro de nome (decisão do dono, 2026-10-09):
    // o código tem de estar escrito como o do projeto — em 2027, com códigos de 5 dígitos, a regra é a mesma.
    problemas.push(
      `O código do projeto no nome (${primeirosDigitos(nome.projeto.texto)}) não está escrito como o do projeto (${primeirosDigitos(e.codigoProjeto)}).`,
    );
  }

  // N1-a: no padrão antigo a revisão vai no nome (-R01) e tem de bater com a que o sistema espera.
  if (nome.revisao && nome.revisao.valor !== e.numero - 1) {
    problemas.push(`O nome indica R${String(nome.revisao.valor).padStart(2, "0")}, mas o sistema espera ${rotuloRevisao(e.numero)}.`);
  }
  return problemas;
}

export function problemasDoEnvio(e: EntradaEnvio): string[] {
  const problemas: string[] = [];

  if (!e.nomenclaturaLivre) problemas.push(...problemasDoNome(e));

  // O PDF é a cópia de leitura do DESENHO: só é exigido quando a revisão tem um (decisão do dono,
  // 2026-10-21). Planilha de quantitativos, memorial em Word e afins seguem sem PDF. Documento de
  // modelo (IFC) também não tem: o IFC é o arquivo principal dele.
  const exts = e.arquivos.map((a) => a.ext);
  if (e.arquivos.length === 0) problemas.push("A revisão não tem arquivo para enviar.");
  else if (!ehDocumentoDeModelo(exts) && temDesenho(exts) && !exts.includes("pdf")) problemas.push(MOTIVO_DESENHO_SEM_PDF);

  for (const a of e.arquivos) {
    const igual = e.anteriores.find((p) => p.ext === a.ext && p.hash === a.hash);
    if (igual) {
      problemas.push(`O ${a.ext.toUpperCase()} é idêntico ao da revisão anterior. Envie o arquivo corrigido.`);
    }
  }

  if (e.numero >= PRECISA_DESCRICAO_A_PARTIR_DE && !e.descricao?.trim()) {
    problemas.push("Descreva o que mudou nesta revisão.");
  }
  return problemas;
}

/** Mensagem única do `ActionError` (o diálogo mostra a lista). */
export function mensagemDosProblemas(problemas: readonly string[]): string {
  if (problemas.length === 1) return problemas[0];
  return `Corrija antes de enviar para análise:\n${problemas.map((p) => `• ${p}`).join("\n")}`;
}
