/**
 * "Novas tarefas": várias tarefas de uma vez a partir de um texto colado (do Excel, do Word, de um e-mail) — PURO.
 *
 * Uma tarefa por linha. Opcional, depois de um TAB, a duração, lida como a célula Duração do cronograma
 * (`lerDuracao`): `5`, `5d`, `2,5`, e `0` ou `marco` viram marco. Linha em branco é ignorada. O número da linha de um
 * erro conta o texto colado como ele está (com as linhas em branco), para a pessoa achar a linha. O servidor lê o MESMO
 * texto com esta função — a tela não manda tarefas já "interpretadas", então não há duas leituras que divirjam.
 */
import { MAX_LINHAS_LOTE } from "./arvore-lote";
import { lerDuracao } from "./gantt-linhas";

export type TarefaColada = { nome: string; marco: boolean; /** `null` = o padrão (1 dia útil). */ duracaoDias: number | null };

export type LeituraColada = { ok: true; tarefas: TarefaColada[] } | { ok: false; erro: string; /** 1-based; 0 = o texto todo. */ linha: number };

const NOME_MAX = 300;

export function lerTarefasColadas(texto: string): LeituraColada {
  const tarefas: TarefaColada[] = [];
  const linhas = texto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const bruta = linhas[i];
    if (bruta.trim() === "") continue;
    const linha = i + 1;
    if (tarefas.length >= MAX_LINHAS_LOTE) return { ok: false, erro: `Cole no máximo ${MAX_LINHAS_LOTE} tarefas de uma vez.`, linha };
    const [nomeBruto, duracaoBruta = ""] = bruta.split("\t");
    const nome = nomeBruto.trim();
    if (!nome) return { ok: false, erro: "Informe o nome da tarefa.", linha };
    if (nome.length > NOME_MAX) return { ok: false, erro: `O nome da tarefa passa de ${NOME_MAX} caracteres.`, linha };
    const duracao = duracaoBruta.trim();
    if (!duracao) {
      tarefas.push({ nome, marco: false, duracaoDias: null });
      continue;
    }
    const d = lerDuracao(duracao);
    if (!d.ok) return { ok: false, erro: d.erro, linha };
    tarefas.push(d.marco ? { nome, marco: true, duracaoDias: null } : { nome, marco: false, duracaoDias: d.dias });
  }
  if (tarefas.length === 0) return { ok: false, erro: "Cole ao menos uma tarefa.", linha: 0 };
  return { ok: true, tarefas };
}
