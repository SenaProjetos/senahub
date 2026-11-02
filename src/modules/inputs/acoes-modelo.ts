/** Ações dos modelos de formulário e do editor (ADR-0002): dado puro, o mesmo array vai ao menu de contexto e ao `...`. */
import { ArrowRightLeft, Copy, Pencil, Trash2, ArchiveRestore, Archive, Star } from "lucide-react";
import type { AcaoItem } from "@/components/ui/acoes";

/** Linha da lista de modelos (Configurações → Modelos de formulário). */
export function itensDoModelo(m: { id: string; padrao: boolean; ativo: boolean }, podeGerir: boolean): AcaoItem[] {
  if (!podeGerir) return [];
  return [
    { tipo: "link", id: "editar", rotulo: "Editar", icone: Pencil, href: `/configuracoes/inputs/modelos/${m.id}` },
    { tipo: "acao", id: "duplicar", rotulo: "Duplicar", icone: Copy },
    { tipo: "separador", id: "s1" },
    {
      tipo: "acao",
      id: "padrao",
      rotulo: "Tornar o modelo padrão",
      icone: Star,
      desabilitado: m.padrao
        ? "Este já é o modelo padrão."
        : !m.ativo
          ? "Restaure o modelo antes de torná-lo o padrão."
          : undefined,
    },
    m.ativo
      ? {
          tipo: "acao",
          id: "arquivar",
          rotulo: "Arquivar",
          icone: Archive,
          desabilitado: m.padrao ? "O modelo padrão não pode ser arquivado. Torne outro modelo o padrão antes." : undefined,
        }
      : { tipo: "acao", id: "restaurar", rotulo: "Restaurar", icone: ArchiveRestore },
  ];
}

/** Menu de uma pergunta no editor. `outrasSecoes` alimenta o submenu "Mover para". */
export function itensDaPerguntaDoModelo(outrasSecoes: readonly { id: string; titulo: string }[]): AcaoItem[] {
  return [
    { tipo: "acao", id: "duplicar", rotulo: "Duplicar pergunta", icone: Copy },
    ...(outrasSecoes.length > 0
      ? ([
          {
            tipo: "sub",
            id: "mover",
            rotulo: "Mover para a seção",
            icone: ArrowRightLeft,
            itens: outrasSecoes.map((s) => ({ tipo: "acao" as const, id: `mover:${s.id}`, rotulo: s.titulo || "Seção sem título" })),
          },
        ] satisfies AcaoItem[])
      : []),
    { tipo: "separador", id: "s1" },
    {
      tipo: "acao",
      id: "excluir",
      rotulo: "Excluir pergunta",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir esta pergunta do modelo?",
        descricao:
          "Ela some do formulário (tela e link do cliente). As respostas já dadas ficam guardadas nos projetos, mas deixam de aparecer.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

/** Menu de uma seção no editor. */
export function itensDaSecaoDoModelo(s: { titulo: string; perguntas: number }, ultimaSecao: boolean): AcaoItem[] {
  return [
    {
      tipo: "acao",
      id: "excluir",
      rotulo: "Excluir seção",
      icone: Trash2,
      variant: "destructive",
      desabilitado: ultimaSecao ? "O formulário precisa de pelo menos uma seção." : undefined,
      confirmar: {
        titulo: `Excluir a seção “${s.titulo || "sem título"}”?`,
        descricao:
          s.perguntas > 0
            ? `As ${s.perguntas} pergunta(s) dela saem do formulário. As respostas já dadas ficam guardadas nos projetos, mas deixam de aparecer.`
            : "A seção está vazia.",
        rotuloConfirmar: "Excluir seção",
      },
    },
  ];
}
