/**
 * Saúde do Cronograma (Doc 03 §34) — uma nota de 0 a 100 sobre os achados do verificador.
 *
 * PURO: sem I/O.
 *
 * NASCE PROVISÓRIA, e isso é decisão registrada (D42), não cautela genérica. O próprio
 * Doc 03 §34 pede "metodologia documentada antes de ser utilizada oficialmente", e o risco
 * aqui não é técnico: uma nota mal calibrada, usada para cobrar equipe antes de alguém
 * entender o que ela mede, faz a equipe otimizar a NOTA em vez do projeto — some a linha
 * sem sucessora, vira todo mundo responsável por tudo, e o cronograma piora enquanto o
 * número sobe.
 *
 * O que é oficial desde já é o VERIFICADOR (`qualidade.ts`): cada achado dele é verdade ou
 * mentira, sem peso nem calibração. A nota é a leitura ponderada; os pesos abaixo são a
 * primeira tentativa e devem ser revistos com projetos reais antes de a nota virar meta.
 *
 * A foto semanal é gravada desde o PRIMEIRO dia, mesmo com a nota provisória: o histórico
 * é irrecuperável: ligar seis meses depois significa começar do zero, com meia dúzia de
 * meses de evolução perdida.
 */
import type { Achado, RegraQualidade } from "./qualidade";

/**
 * Peso de cada regra na nota, por OCORRÊNCIA, em pontos percentuais.
 *
 * A lógica dos valores: o que quebra a confiança no número dói mais que o que é só falta
 * de capricho. "Concluída sem término real" e "futura com avanço" corrompem o realizado —
 * é dado mentindo. "Sem sucessora" é um vínculo provavelmente esquecido, mas o cronograma
 * segue legível. Crítica atrasada dói mais que atrasada comum porque arrasta o projeto.
 */
const PESO: Record<RegraQualidade, number> = {
  vinculo_circular: 12,
  futura_com_avanco: 8,
  concluida_sem_termino_real: 6,
  critica_atrasada: 6,
  marco_com_duracao: 4,
  sem_duracao: 4,
  atrasada: 3,
  iniciada_sem_inicio_real: 2,
  bloqueada: 2,
  sem_responsavel: 2,
  duracao_excessiva: 1.5,
  sem_sucessora: 1,
  sem_predecessora: 0.5,
  // Achados do cronograma inteiro, não de linha: contam uma vez e pesam alto, porque
  // afetam a leitura de TODO o resto.
  excesso_de_restricoes: 8,
  sem_data_status: 15,
};

/**
 * Teto de desconto por regra. Sem ele, 60 linhas sem responsável zerariam a nota sozinhas
 * e esconderiam um ciclo de dependência — o problema mais grave ficaria invisível atrás do
 * mais comum.
 */
const TETO_POR_REGRA = 20;

export type FaixaSaude = "saudavel" | "atencao" | "critico";

export type ResultadoSaude = {
  /** 0 a 100, arredondado. */
  nota: number;
  faixa: FaixaSaude;
  /** Quanto cada regra tirou da nota, da maior perda para a menor. */
  descontos: { regra: RegraQualidade; ocorrencias: number; pontos: number }[];
  /**
   * SEMPRE `true` nesta versão. É o que a tela usa para rotular a nota como provisória —
   * e o que um `grep` encontra quando a metodologia for oficializada (D42).
   */
  provisoria: true;
};

export function faixaDaNota(nota: number): FaixaSaude {
  if (nota >= 85) return "saudavel";
  if (nota >= 60) return "atencao";
  return "critico";
}

/**
 * Nota do cronograma a partir dos achados.
 *
 * Cronograma VAZIO devolve `null`, não 100: "nada a reclamar" e "nada a mostrar" são
 * coisas diferentes, e um projeto sem EAP aparecendo como 100% saudável seria a pior
 * leitura possível do indicador.
 */
export function calcularSaude(achados: Achado[], totalDeLinhas: number): ResultadoSaude | null {
  if (totalDeLinhas === 0) return null;

  const porRegra = new Map<RegraQualidade, number>();
  for (const a of achados) porRegra.set(a.regra, (porRegra.get(a.regra) ?? 0) + 1);

  const descontos = [...porRegra.entries()]
    .map(([regra, ocorrencias]) => ({
      regra,
      ocorrencias,
      pontos: Math.min(TETO_POR_REGRA, ocorrencias * (PESO[regra] ?? 0)),
    }))
    .filter((d) => d.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);

  const total = descontos.reduce((s, d) => s + d.pontos, 0);
  const nota = Math.max(0, Math.round(100 - total));

  return { nota, faixa: faixaDaNota(nota), descontos, provisoria: true };
}

/**
 * Texto curto do que mais puxou a nota para baixo — o que a tela mostra ao lado do número.
 *
 * Existe porque nota sem causa não muda comportamento: "72%" faz o coordenador dar de
 * ombros; "72% — 14 linhas sem responsável" faz ele abrir a tela.
 */
export function principalCausa(resultado: ResultadoSaude | null): string | null {
  const maior = resultado?.descontos[0];
  if (!maior) return null;
  const rotulo: Partial<Record<RegraQualidade, string>> = {
    vinculo_circular: "dependência circular",
    futura_com_avanco: "avanço informado em linha que não começou",
    concluida_sem_termino_real: "concluída sem término real",
    critica_atrasada: "linha crítica atrasada",
    marco_com_duracao: "marco com duração",
    sem_duracao: "atividade sem duração",
    atrasada: "linha atrasada",
    iniciada_sem_inicio_real: "iniciada sem início real",
    bloqueada: "linha bloqueada",
    sem_responsavel: "linha sem responsável",
    duracao_excessiva: "atividade longa demais",
    sem_sucessora: "linha sem sucessora",
    sem_predecessora: "linha sem predecessora",
    excesso_de_restricoes: "excesso de datas fixadas",
    sem_data_status: "sem Data de Status",
  };
  const nome = rotulo[maior.regra] ?? maior.regra;
  return maior.ocorrencias > 1 ? `${maior.ocorrencias} × ${nome}` : nome;
}
