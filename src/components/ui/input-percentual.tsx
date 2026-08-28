"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  DECIMAIS_PERCENTUAL_PADRAO,
  formatarPercentual,
  limparEntradaPercentual,
  normalizarPercentual,
  parsePercentual,
} from "@/lib/percentual";
import { cn } from "@/lib/utils";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "step"
> & {
  /** Percentual na escala 0–100. `null` = campo vazio (distinto de 0). */
  value: number | null | undefined;
  /** Recebe o número cru, nunca o texto formatado. */
  onChange: (valor: number | null) => void;
  /**
   * Casas decimais aceitas. Use `0` onde o schema exige inteiro (ex.: percentual de
   * alocação em planejamento é `z.number().int()`) e `3` para alíquotas de encargo.
   */
  decimais?: number;
  /** Libera o sinal `-`. Só onde o domínio aceita (margem de prejuízo, reajuste negativo). */
  permiteNegativo?: boolean;
  /** Oculta o "%" — para quando o rótulo/coluna ao lado já indica a unidade. */
  semSufixo?: boolean;
};

/**
 * Campo de percentual (escala 0–100).
 *
 * Diferente de `InputMoeda`, aqui **não** há digitação da direita para a esquerda:
 * digitar `25` significa 25%. E a formatação acontece no **blur**, não a cada tecla —
 * formatar durante a digitação tornaria `25,5` indigitável (a vírgula seria reescrita
 * antes do `5` chegar). Enquanto o campo está em foco ele guarda o texto cru do usuário.
 */
function InputPercentual({
  value,
  onChange,
  decimais = DECIMAIS_PERCENTUAL_PADRAO,
  permiteNegativo,
  semSufixo,
  className,
  ...props
}: Props) {
  const externo = value ?? null;
  const [texto, setTexto] = React.useState(() =>
    externo === null ? "" : formatarPercentual(externo, decimais),
  );

  // Só ressincroniza quando o valor de fora divergir do que o texto local representa.
  // Um percentual tem várias grafias para o mesmo número ("25", "25,", "25,0"), então
  // recalcular o texto a cada render apagaria a vírgula no meio da digitação.
  React.useEffect(() => {
    setTexto((atual) =>
      parsePercentual(atual) === externo
        ? atual
        : externo === null
          ? ""
          : formatarPercentual(externo, decimais),
    );
  }, [externo, decimais]);

  function aoDigitar(e: React.ChangeEvent<HTMLInputElement>) {
    const limpo = limparEntradaPercentual(e.target.value, decimais, permiteNegativo);
    setTexto(limpo);
    onChange(parsePercentual(limpo));
  }

  function aoSair(e: React.FocusEvent<HTMLInputElement>) {
    props.onBlur?.(e);
    const normalizado = normalizarPercentual(texto, decimais);
    setTexto(normalizado);
    // O blur pode arredondar ("7,456" → "7,46"): reemite para o formulário não guardar
    // um número mais preciso do que o campo aceita.
    onChange(parsePercentual(normalizado));
  }

  const campo = (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      onChange={aoDigitar}
      onBlur={aoSair}
      className={cn("text-right tabular-nums", !semSufixo && "pr-7", className)}
    />
  );

  if (semSufixo) return campo;

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
      {campo}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground select-none"
      >
        %
      </span>
    </div>
  );
}

export { InputPercentual };
