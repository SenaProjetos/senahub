"use client";

import * as React from "react";

import { FieldError, idDoErro } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { campoDe, exibicaoInicial, mensagemDe, type NomeCampo } from "@/lib/campos";
import { aplicarEdicao } from "@/lib/campos/edicao";
import type { TipoPix } from "@/modules/rh/contas/pix";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "maxLength"
> & {
  tipo: NomeCampo | "chavePix";
  /** Só com `tipo="chavePix"`. Vazio = campo de texto livre (o tipo ainda não foi escolhido). */
  tipoPix?: TipoPix | "";
  /** Modo controlado. Para FormData, use `name` + `defaultValue`. */
  value?: string | null;
  defaultValue?: string | null;
  /** Recebe o texto já mascarado — é o formato gravado. */
  onChange?: (valor: string) => void;
  /** Erro vindo do servidor (`useFieldErrors().erros.x`); vence a validação local. */
  erro?: string;
};

/**
 * Campo com formato conhecido (CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX,
 * chave NF-e). Máscara durante a digitação com o cursor estável, validação ao sair do campo e a
 * mensagem logo abaixo. A regra é a do catálogo `lib/campos/`, a mesma do schema da action.
 *
 * Não decide obrigatoriedade (vazio é válido) nem bloqueia o envio: o servidor recusa.
 * `type="text"` sempre: em `type="email"` o navegador não expõe o cursor, e a máscara precisa dele.
 */
function InputFormatado({ tipo, tipoPix, value, defaultValue, onChange, onBlur, erro, id, placeholder, ...props }: Props) {
  const campo = campoDe(tipo, tipoPix || undefined);
  const idGerado = React.useId();
  const idCampo = id ?? idGerado;
  const ref = React.useRef<HTMLInputElement>(null);
  const cursorPendente = React.useRef<number | null>(null);
  const controlado = value !== undefined;
  const [interno, setInterno] = React.useState(() => exibicaoInicial(campo, defaultValue ?? ""));
  const [erroLocal, setErroLocal] = React.useState<string>();
  const texto = controlado ? exibicaoInicial(campo, value ?? "") : interno;

  React.useLayoutEffect(() => {
    const el = ref.current;
    const pos = cursorPendente.current;
    cursorPendente.current = null;
    if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
  });

  function aoMudar(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const r = aplicarEdicao(campo, {
      anterior: texto,
      digitado: el.value,
      cursor: el.selectionStart ?? el.value.length,
      inputType: (e.nativeEvent as InputEvent).inputType,
    });
    cursorPendente.current = r.cursor;
    // Tecla recusada (letra num CPF): o texto não muda, não há render, e o React devolve o valor
    // antigo ao campo jogando o cursor para o fim. Recoloca no lugar.
    if (r.texto === texto) requestAnimationFrame(() => el.setSelectionRange(r.cursor, r.cursor));
    if (!controlado) setInterno(r.texto);
    setErroLocal(undefined);
    onChange?.(r.texto);
  }

  function aoSair(e: React.FocusEvent<HTMLInputElement>) {
    const v = e.target.value;
    setErroLocal(campo.validar(v) ? undefined : mensagemDe(campo, v));
    onBlur?.(e);
  }

  const mensagem = erro || erroLocal;
  return (
    <>
      <Input
        {...props}
        ref={ref}
        id={idCampo}
        type="text"
        inputMode={campo.inputMode}
        autoComplete={props.autoComplete ?? campo.autoComplete}
        placeholder={placeholder ?? campo.placeholder}
        value={texto}
        onChange={aoMudar}
        onBlur={aoSair}
        aria-invalid={mensagem ? true : undefined}
        aria-describedby={mensagem ? idDoErro(idCampo) : props["aria-describedby"]}
      />
      <FieldError campo={idCampo} mensagem={mensagem} />
    </>
  );
}

export { InputFormatado };
