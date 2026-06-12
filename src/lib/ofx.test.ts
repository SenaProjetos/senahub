import { describe, it, expect } from "vitest";
import { parseOfx } from "@/lib/ofx";

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260115120000[-3:BRT]
<TRNAMT>1500.00
<FITID>TX001
<MEMO>Recebimento projeto 26-0001
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260116
<TRNAMT>-450.50
<FITID>TX002
<NAME>Pagamento fornecedor
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("parser OFX", () => {
  it("extrai todas as transações do extrato", () => {
    const t = parseOfx(OFX);
    expect(t).toHaveLength(2);
  });

  it("preserva o sinal do valor (entrada positiva, saída negativa)", () => {
    const t = parseOfx(OFX);
    expect(t[0].valor).toBe(1500);
    expect(t[1].valor).toBe(-450.5);
  });

  it("usa MEMO ou NAME como descrição", () => {
    const t = parseOfx(OFX);
    expect(t[0].descricao).toBe("Recebimento projeto 26-0001");
    expect(t[1].descricao).toBe("Pagamento fornecedor");
  });

  it("parseia a data ignorando hora/timezone do DTPOSTED", () => {
    const t = parseOfx(OFX);
    expect(t[0].data.getFullYear()).toBe(2026);
    expect(t[0].data.getMonth()).toBe(0); // janeiro
    expect(t[0].data.getDate()).toBe(15);
  });

  it("captura o FITID (chave de deduplicação)", () => {
    const t = parseOfx(OFX);
    expect(t.map((x) => x.fitid)).toEqual(["TX001", "TX002"]);
  });

  it("retorna vazio para conteúdo sem transações", () => {
    expect(parseOfx("sem nada aqui")).toEqual([]);
  });
});
