"use client";

import * as React from "react";

import { FieldError, idDoErro } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { campoDe, exibicaoInicial, mensagemDe, mesmoValor, type NomeCampo } from "@/lib/campos";
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

/** Um clique (pointerdown) há menos que isto antes do blur: o erro espera o clique terminar. */
const JANELA_CLIQUE_MS = 1000;
/** Se o `click` não vier (arrastou, segurou), o erro aparece depois disto. */
const ESPERA_CLIQUE_MS = 600;

/**
 * Campo com formato conhecido (CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX,
 * chave NF-e). Máscara durante a digitação com o cursor estável, validação ao sair do campo e a
 * mensagem logo abaixo. A regra é a do catálogo `lib/campos/`, a mesma do schema da action.
 *
 * Não decide obrigatoriedade (vazio é válido) nem bloqueia o envio: o servidor recusa.
 * `type="text"` sempre: em `type="email"` o navegador não expõe o cursor, e a máscara precisa dele.
 *
 * O valor que veio gravado não acusa erro ao sair do campo enquanto continuar o mesmo (spec D4: o
 * servidor também o deixa passar). Saindo do campo com um clique, a mensagem só aparece depois do
 * clique: ela empurra o que está abaixo, e o botão sairia de baixo do mouse antes do `click`.
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

  /** Valor gravado ao abrir (ou trazido de fora depois): o legado inválido dele não acusa erro. */
  const gravado = React.useRef({ texto: (controlado ? value : defaultValue) ?? "", tipoPix });
  /** Último texto que este campo mandou ao `onChange` — o `value` que volta igual não é "de fora". */
  const emitido = React.useRef<string | null>(null);
  const valorAnterior = React.useRef(value);
  /** Último pointerdown fora deste campo e última tecla: decidem se o blur veio de um clique. */
  const ultimoPointerDown = React.useRef(0);
  const ultimaTecla = React.useRef(0);
  /** Cancela a mensagem que espera o clique terminar. */
  const erroPendente = React.useRef<(() => void) | null>(null);

  const cancelarErroPendente = React.useCallback(() => {
    erroPendente.current?.();
    erroPendente.current = null;
  }, []);

  React.useLayoutEffect(() => {
    const el = ref.current;
    const pos = cursorPendente.current;
    cursorPendente.current = null;
    if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
  });

  React.useEffect(() => {
    // Clique no próprio campo zera: o foco veio dele, e um clique anterior em outro lugar não conta.
    const marcar = (e: PointerEvent) => {
      ultimoPointerDown.current = e.target === ref.current ? 0 : Date.now();
    };
    const tecla = () => {
      ultimaTecla.current = Date.now();
    };
    window.addEventListener("pointerdown", marcar, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("pointerdown", marcar, true);
      window.removeEventListener("keydown", tecla, true);
      cancelarErroPendente();
    };
  }, [cancelarErroPendente]);

  // `value` mudou por fora (formulário limpo, outro registro): o erro local era do texto anterior.
  React.useEffect(() => {
    if (value === valorAnterior.current) return;
    valorAnterior.current = value;
    if ((value ?? "") === emitido.current) return;
    gravado.current = { texto: value ?? "", tipoPix };
    cancelarErroPendente();
    setErroLocal(undefined);
  }, [value, tipoPix, cancelarErroPendente]);

  function aoMudar(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const r = aplicarEdicao(campo, {
      anterior: texto,
      digitado: el.value,
      cursor: el.selectionStart ?? el.value.length,
      inputType: (e.nativeEvent as InputEvent).inputType,
    });
    if (r.texto === texto) {
      // Tecla recusada (letra num CPF): o texto não muda, não há render, e o React devolve o valor
      // antigo ao campo jogando o cursor para o fim. Recoloca no lugar — e não deixa o cursor
      // pendente para um render qualquer depois o aplicar fora de hora.
      cursorPendente.current = null;
      requestAnimationFrame(() => el.setSelectionRange(r.cursor, r.cursor));
    } else {
      cursorPendente.current = r.cursor;
    }
    if (!controlado) setInterno(r.texto);
    cancelarErroPendente();
    setErroLocal(undefined);
    emitido.current = r.texto;
    onChange?.(r.texto);
  }

  /** Mostra a mensagem depois do `click` em curso (ou da espera, se ele não vier). */
  function mostrarDepoisDoClique(msg: string) {
    let depois: number | undefined;
    const espera = window.setTimeout(disparar, ESPERA_CLIQUE_MS);
    function desarmar() {
      window.removeEventListener("click", disparar, true);
      window.clearTimeout(espera);
    }
    function disparar() {
      desarmar();
      // setTimeout(0): o listener de captura roda antes do onClick do botão; o erro entra depois dele.
      depois = window.setTimeout(() => {
        erroPendente.current = null;
        setErroLocal(msg);
      }, 0);
    }
    window.addEventListener("click", disparar, { capture: true, once: true });
    erroPendente.current = () => {
      desarmar();
      if (depois !== undefined) window.clearTimeout(depois);
    };
  }

  function aoSair(e: React.FocusEvent<HTMLInputElement>) {
    const v = e.target.value;
    cancelarErroPendente();
    const g = gravado.current;
    const naoMexido = g.texto.trim() !== "" && g.tipoPix === tipoPix && mesmoValor(campo, v, g.texto);
    const msg = campo.validar(v) || naoMexido ? undefined : mensagemDe(campo, v);
    const clique = ultimoPointerDown.current;
    const veioDeClique = clique > ultimaTecla.current && Date.now() - clique < JANELA_CLIQUE_MS;
    if (msg && veioDeClique) mostrarDepoisDoClique(msg);
    else setErroLocal(msg);
    onBlur?.(e);
  }

  const mensagem = erro || erroLocal;
  const descricao = [props["aria-describedby"], mensagem ? idDoErro(idCampo) : undefined].filter(Boolean).join(" ");
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
        aria-describedby={descricao || undefined}
      />
      <FieldError campo={idCampo} mensagem={mensagem} />
    </>
  );
}

export { InputFormatado };
