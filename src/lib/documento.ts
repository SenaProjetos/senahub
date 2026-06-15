/** Validação e formatação de CPF/CNPJ (dígitos verificadores). */

export function soDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

export function validarCPF(cpf: string): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(c[10]);
}

export function validarCNPJ(cnpj: string): boolean {
  const c = soDigitos(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(c[12])) return false;
  const d2 = dv(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(c[13]);
}

/** Valida CPF (11 díg.) ou CNPJ (14 díg.). */
export function validarCpfCnpj(doc: string): boolean {
  const c = soDigitos(doc);
  if (c.length === 11) return validarCPF(c);
  if (c.length === 14) return validarCNPJ(c);
  return false;
}

export function formatarCpfCnpj(doc: string): string {
  const c = soDigitos(doc);
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}
