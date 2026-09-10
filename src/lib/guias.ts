import {
  BookOpen,
  FolderKanban,
  Gauge,
  HeartPulse,
  Home,
  MessageSquare,
  Scale,
  Settings,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Catálogo dos **Guias de uso** (`/guias`). Um guia por **setor** — os mesmos 9 agrupamentos do
 * `SECAO_LABEL` de `lib/manual.ts`, não os 34 módulos: setor ≠ rota, e "Gestão" cobre seis telas
 * independentes. Decisão N1 do plano `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`.
 *
 * Fonte única de três coisas que antes desalinhavam: a validação do `[setor]`, as fichas do índice
 * e o destino do botão "Guia" na página-âncora de cada setor.
 *
 * `estado: "em-breve"` aparece no índice desabilitado — de propósito. A cobertura é parcial e o
 * índice é o roadmap visível dela; esconder as lacunas faria o leitor achar que o resto não existe.
 */
export type SetorGuia = {
  /** Mesma chave do `SECAO_LABEL` — é o segmento de `/guias/[setor]` e a pasta em `docs/manual/`. */
  chave: string;
  titulo: string;
  /** Uma linha, em linguagem de resultado: o que a pessoa sai sabendo. */
  descricao: string;
  icone: LucideIcon;
  /** Página do setor que recebe o botão "Guia". `null` = sem âncora natural ainda. */
  ancora: string | null;
  estado: "pronto" | "em-breve";
};

export const SETORES_GUIA: readonly SetorGuia[] = [
  {
    chave: "inicio",
    titulo: "Início e Portal",
    descricao: "A tela inicial, o Meu Dia e o que o cliente vê no Portal.",
    icone: Home,
    ancora: "/",
    estado: "em-breve",
  },
  {
    chave: "projetos",
    titulo: "Projetos",
    descricao: "Do projeto contratado à entrega: disciplinas, planejamento, tarefas e apontamentos.",
    icone: FolderKanban,
    ancora: "/projetos",
    estado: "pronto",
  },
  {
    chave: "clientes-comercial",
    titulo: "Clientes e Comercial",
    descricao: "Do primeiro contato ao projeto contratado: entrada, lead, negociação e proposta.",
    icone: TrendingUp,
    ancora: "/comercial",
    estado: "pronto",
  },
  {
    chave: "financeiro",
    titulo: "Financeiro",
    descricao: "Lançamentos, contas, aging, conciliação e o que cada relatório responde.",
    icone: Wallet,
    ancora: "/financeiro",
    estado: "pronto",
  },
  {
    chave: "rh-ponto",
    titulo: "RH e Ponto",
    descricao: "Ponto, escala, férias e folha — e onde CLT e projetista PJ seguem caminhos diferentes.",
    icone: HeartPulse,
    ancora: "/rh",
    estado: "pronto",
  },
  {
    chave: "engenharia",
    titulo: "Engenharia",
    descricao: "As ferramentas de cálculo, os padrões e a biblioteca de normas técnicas.",
    icone: Gauge,
    ancora: "/ferramentas",
    estado: "em-breve",
  },
  {
    chave: "gestao",
    titulo: "Gestão",
    descricao: "Licitações, contratos, certidões, qualidade, patrimônio e o cofre de acessos.",
    icone: Scale,
    // Gestão não tem página-âncora natural: são seis rotas independentes. `/licitacoes` é a de
    // maior movimento; se ficar esquisito na prática, o sidebar e o índice cobrem o caso.
    ancora: "/licitacoes",
    estado: "em-breve",
  },
  {
    chave: "comunicacao",
    titulo: "Comunicação",
    descricao: "Chat, notificações e como abrir um chamado no suporte.",
    icone: MessageSquare,
    ancora: "/chat",
    estado: "em-breve",
  },
  {
    chave: "sistema",
    titulo: "Sistema",
    descricao: "Preferências, configurações e o que a auditoria registra.",
    icone: Settings,
    ancora: "/configuracoes",
    estado: "em-breve",
  },
] as const;

/** Ícone do próprio módulo de guias — usado no sidebar e no cabeçalho do índice. */
export const ICONE_GUIAS = BookOpen;

export function acharSetorGuia(chave: string): SetorGuia | undefined {
  return SETORES_GUIA.find((s) => s.chave === chave);
}

/** Ficha do setor **com guia publicado**, ou `undefined`. É o que o `[setor]` valida. */
export function acharGuiaPublicado(chave: string): SetorGuia | undefined {
  const setor = acharSetorGuia(chave);
  return setor?.estado === "pronto" ? setor : undefined;
}

/** Rota do guia de um setor — para o botão da página-âncora não montar a URL à mão. */
export function rotaGuia(chave: string): string {
  return `/guias/${chave}`;
}
