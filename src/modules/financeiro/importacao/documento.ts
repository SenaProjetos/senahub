/**
 * Documento do contato criado pela importação (puro, sem I/O).
 *
 * Cliente guarda SÓ DÍGITOS (`Cliente.documento` — unicidade por dígitos, ADR-03 do CRM; é a exceção
 * aceita ao formato padrão). Fornecedor guarda o formato padrão (`000.000.000-00` / `00.000.000/0000-00`).
 * A busca de cadastro existente compara SEMPRE dígitos dos dois lados (`chaveDocumento`), então um
 * fornecedor legado gravado só com dígitos continua sendo achado e não vira duplicata.
 */
import { CAMPOS } from "@/lib/campos";
import { soDigitos } from "@/lib/documento";

export function documentoParaGravar(tipo: "cliente" | "fornecedor", doc: string): string | null {
  if (!doc) return null;
  return tipo === "cliente" ? soDigitos(doc) : CAMPOS.cpfCnpj.normalizar(doc);
}

/** Chave de comparação entre o documento do CSV e o gravado (qualquer formato). */
export function chaveDocumento(doc: string): string {
  return soDigitos(doc);
}
