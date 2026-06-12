/**
 * Parser OFX tolerante (formato SGML, comum em extratos bancários BR).
 * Extrai transações de blocos <STMTTRN>. Tags frequentemente não têm
 * fechamento — o valor vai até o próximo '<' ou quebra de linha.
 */

export type TransacaoOfx = {
  fitid: string;
  data: Date;
  valor: number;
  descricao: string;
  tipo: string;
};

function campo(bloco: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : undefined;
}

function parseDataOfx(s?: string): Date | null {
  if (!s) return null;
  // YYYYMMDD[HHMMSS][.fff][-3:BRT]
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(date.getTime()) ? null : date;
}

export function parseOfx(conteudo: string): TransacaoOfx[] {
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const out: TransacaoOfx[] = [];

  for (const bloco of blocos) {
    const data = parseDataOfx(campo(bloco, "DTPOSTED"));
    const valorRaw = campo(bloco, "TRNAMT");
    const fitid = campo(bloco, "FITID");
    if (!data || !valorRaw || !fitid) continue;

    const valor = Number(valorRaw.replace(",", "."));
    if (isNaN(valor)) continue;

    const descricao =
      campo(bloco, "MEMO") || campo(bloco, "NAME") || "Transação sem descrição";
    const tipo = campo(bloco, "TRNTYPE") || (valor >= 0 ? "CREDIT" : "DEBIT");

    out.push({ fitid, data, valor, descricao, tipo });
  }
  return out;
}
