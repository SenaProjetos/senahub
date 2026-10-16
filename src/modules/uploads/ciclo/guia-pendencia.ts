import { ROTULO_PENDENCIA, type TipoPendencia } from "./pendencias";

type Tipo = TipoPendencia | "corrigida";

/** O que fazer com a pendência — texto do bloco da linha. Puro, testado. */
export function guiaDaPendencia(p: { tipo: Tipo; estado: string | null }): { resumo: string; passos: string[] } {
  if (p.tipo === "publicada_com_lixeira" && p.estado === "publicado") {
    return {
      resumo: "Este é o arquivo vigente do documento e está na lixeira.",
      passos: [
        "Abra a lixeira do projeto e veja quem excluiu e por quê.",
        "Foi engano? Restaure o arquivo (só administrador).",
        "O arquivo mudou de verdade? Publique uma nova revisão.",
        "Foi intencional? Dispense com o motivo.",
      ],
    };
  }
  if (p.tipo === "publicada_com_lixeira") {
    return {
      resumo: "Revisão antiga, já substituída. Excluir o arquivo costuma ser limpeza.",
      passos: [
        "Foi limpeza proposital? Dispense com o motivo.",
        "Não foi? Restaure da lixeira: o arquivo arquivado é o registro daquela revisão.",
      ],
    };
  }
  if (p.tipo === "analise_parada") {
    return {
      resumo: "A revisão espera análise além do prazo do projeto.",
      passos: [
        "Abra o documento e veja quem deve analisar.",
        "Cobre a análise, ou aprove ou devolva a revisão.",
        "A espera foi combinada? Dispense com o motivo.",
      ],
    };
  }
  if (p.tipo === "duas_publicadas") {
    return {
      resumo: "Não deveria acontecer: o banco devia impedir.",
      passos: [
        "Abra o documento e confira qual revisão é a vigente.",
        "Arquive a outra.",
        "Avise o desenvolvedor, porque o índice do banco falhou. Não dispense.",
      ],
    };
  }
  return {
    resumo: "Nada a fazer. O sistema já resolveu.",
    passos: ["A liberação indevida foi revogada e está no histórico do documento."],
  };
}

/** Painel "Como resolver cada tipo de pendência", no alto da tela. */
export const GUIA_DOS_TIPOS: { tipo: Tipo; rotulo: string; texto: string }[] = [
  {
    tipo: "publicada_com_lixeira",
    rotulo: ROTULO_PENDENCIA.publicada_com_lixeira,
    texto:
      "Um arquivo de revisão publicada ou arquivada foi para a lixeira. Revisão publicada é o arquivo vigente: restaure, ou publique outra revisão. Revisão arquivada costuma ser limpeza: se foi proposital, dispense com o motivo.",
  },
  {
    tipo: "analise_parada",
    rotulo: ROTULO_PENDENCIA.analise_parada,
    texto: "A revisão está em análise além do prazo do projeto. Cobre quem analisa, ou aprove ou devolva. Dispense só se a espera foi combinada.",
  },
  {
    tipo: "duas_publicadas",
    rotulo: ROTULO_PENDENCIA.duas_publicadas,
    texto: "Não deveria acontecer. Confira qual revisão é a vigente e arquive a outra. Não dispense: avise o desenvolvedor.",
  },
  {
    tipo: "corrigida",
    rotulo: ROTULO_PENDENCIA.corrigida,
    texto: "Nada a fazer. O sistema revogou uma liberação indevida e gravou no histórico do documento.",
  },
];
