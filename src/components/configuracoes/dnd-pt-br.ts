import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";

/** Textos do dnd-kit em português (o padrão da biblioteca é inglês) para o leitor de tela. */
export const instrucoesDnd: ScreenReaderInstructions = {
  draggable:
    "Para pegar o item, pressione Espaço. Use as setas para mover e Espaço para soltar. Esc cancela o movimento.",
};

/** `item` no singular com artigo: "a pergunta", "a seção", "a opção". */
export function anunciosDnd(item: string): Announcements {
  return {
    onDragStart: () => `Pegou ${item}.`,
    onDragOver: ({ over }) => (over ? `Movendo ${item}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Soltou ${item} na nova posição.` : `Soltou ${item} na posição de origem.`),
    onDragCancel: () => `Movimento cancelado. ${item.charAt(0).toUpperCase()}${item.slice(1)} voltou à posição de origem.`,
  };
}
