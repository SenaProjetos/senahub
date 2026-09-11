/**
 * Id da mensagem de erro de um campo — o `aria-describedby` do controle aponta para ele.
 * Mora aqui (sem "use client") e não no hook: `FieldError` pode ser renderizado por um
 * Server Component, e aí não pode depender de um módulo de cliente.
 */
export function idDoErro(idCampo: string): string {
  return `${idCampo}-erro`;
}

/**
 * Mensagem de erro sob um campo. `campo` é o id do controle — o id da mensagem sai dele
 * (`idDoErro`), o mesmo que `useFieldErrors().campo()` põe no `aria-describedby`.
 * Sem mensagem não renderiza nada.
 */
export function FieldError({ campo, mensagem }: { campo: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p id={idDoErro(campo)} className="text-xs text-destructive">
      {mensagem}
    </p>
  );
}
