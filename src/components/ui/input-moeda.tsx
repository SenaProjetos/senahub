"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  alternarSinal,
  aplicarDigito,
  apagarDigito,
  colarParaDigitos,
  digitosParaValor,
  formatarDigitos,
  valorParaDigitos,
} from "@/lib/moeda";
import { cn } from "@/lib/utils";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "step"
> & {
  /** Valor em reais. `null` = campo vazio (distinto de 0). */
  value: number | null | undefined;
  /** Recebe o número cru, nunca o texto formatado. */
  onChange: (valor: number | null) => void;
  /** Oculta o "R$" — para células de tabela cujo cabeçalho já indica a moeda. */
  semPrefixo?: boolean;
  /**
   * Libera a tecla `-` (alterna o sinal). Só onde o domínio aceita valor negativo —
   * aditivo de supressão, saldo inicial de conta. Sem isto o campo é não-negativo por
   * construção, e um negativo colado entra pelo módulo.
   */
  permiteNegativo?: boolean;
};

/**
 * Campo de valor monetário (BRL).
 *
 * - símbolo R$ fixo dentro do campo, alinhamento à direita, `inputmode="decimal"`;
 * - digitação da direita para a esquerda: 5 → 0,05 · 50 → 0,50 · 500 → 5,00;
 * - formata em tempo real e devolve ao formulário apenas o número cru.
 *
 * Rótulo: descreva o campo como monetário ("Valor", "Salário base"). O prefixo
 * visual é decorativo e não é anunciado por leitor de tela.
 */
function InputMoeda({ value, onChange, semPrefixo, permiteNegativo, className, placeholder, ...props }: Props) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [digitos, setDigitos] = React.useState(() => valorParaDigitos(value));

  // Hidratação: valor que vem de fora é lido em REAIS e nunca passa pelo
  // redutor de teclas (que lê centavos).
  const canonico = valorParaDigitos(value);
  React.useEffect(() => {
    setDigitos((atual) => (atual === canonico ? atual : canonico));
  }, [canonico]);

  const texto = formatarDigitos(digitos);

  // Caret sempre à direita — o número cresce nos centavos, editar no meio não
  // faz sentido neste modelo.
  const fixarCaret = React.useCallback(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    const fim = el.value.length;
    // Não desfaz uma seleção total (Ctrl+A / arrastar tudo): ela é o gesto de
    // "recomeçar o valor".
    if (fim > 0 && el.selectionStart === 0 && el.selectionEnd === fim) return;
    if (el.selectionStart !== fim || el.selectionEnd !== fim) el.setSelectionRange(fim, fim);
  }, []);

  React.useEffect(fixarCaret, [texto, fixarCaret]);

  function emitir(bruto: string) {
    const novo = permiteNegativo ? bruto : bruto.replace("-", "");
    setDigitos(novo);
    onChange(digitosParaValor(novo));
  }

  function selecaoTotal() {
    const el = ref.current;
    return !!el && el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length;
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    props.onKeyDown?.(e);
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      // Selecionar tudo e digitar recomeça o valor.
      emitir(aplicarDigito(selecaoTotal() ? "" : digitos, e.key));
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      emitir(selecaoTotal() ? "" : apagarDigito(digitos));
      return;
    }
    if (permiteNegativo && (e.key === "-" || e.key === "+")) {
      e.preventDefault();
      // "-" alterna; "+" só volta ao positivo.
      emitir(e.key === "+" ? digitos.replace("-", "") : alternarSinal(digitos));
      return;
    }
    // Separadores são inseridos automaticamente; qualquer outro caractere
    // imprimível é ignorado (navegação e atalhos seguem funcionando).
    if (e.key.length === 1) e.preventDefault();
  }

  function aoColar(e: React.ClipboardEvent<HTMLInputElement>) {
    props.onPaste?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const novo = colarParaDigitos(e.clipboardData.getData("text"));
    if (novo !== null) emitir(novo);
  }

  const campo = (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      placeholder={placeholder ?? "0,00"}
      // O valor é controlado pelo teclado; onChange existe só para o React não
      // reclamar de campo controlado sem handler (arrastar texto, ditado).
      onChange={() => fixarCaret()}
      onKeyDown={aoTeclar}
      onPaste={aoColar}
      onFocus={(e) => {
        props.onFocus?.(e);
        requestAnimationFrame(fixarCaret);
      }}
      onClick={(e) => {
        props.onClick?.(e);
        fixarCaret();
      }}
      className={cn("text-right tabular-nums", !semPrefixo && "pl-9", className)}
    />
  );

  if (semPrefixo) return campo;

  // O wrapper NÃO leva `w-full`: numa linha flex ele tem de encolher junto com a largura que
  // o chamador deu ao input (`w-24`, `w-32`). Com `w-full` ele tomava 100% da linha, empurrava
  // os vizinhos para baixo e deixava o símbolo — ancorado na borda do wrapper — longe do campo.
  // Como div de bloco, segue preenchendo a célula de um grid normalmente.
  //
  // Consequência a saber: `className` vai para o INPUT, não para o wrapper. Classe de
  // crescimento (`flex-1`, `grow`) passada pelo chamador não faz o campo esticar numa flex —
  // ela cai dentro de um wrapper que já encolheu. Sem largura declarada o campo assume a
  // largura intrínseca do input (~229px), que é utilizável; hoje ninguém passa `flex-1`.
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground select-none"
      >
        R$
      </span>
      {campo}
    </div>
  );
}

export { InputMoeda };
