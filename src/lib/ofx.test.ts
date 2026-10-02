import { describe, it, expect } from "vitest";
import { parseOfx, parseSaldoOfx } from "@/lib/ofx";

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
    expect(t[0].data.getUTCFullYear()).toBe(2026);
    expect(t[0].data.getUTCMonth()).toBe(0); // janeiro
    expect(t[0].data.getUTCDate()).toBe(15);
  });

  it("captura o FITID (chave de deduplicação)", () => {
    const t = parseOfx(OFX);
    expect(t.map((x) => x.fitid)).toEqual(["TX001", "TX002"]);
  });

  it("retorna vazio para conteúdo sem transações", () => {
    expect(parseOfx("sem nada aqui")).toEqual([]);
  });
});

describe("datas e saldo do OFX (N4)", () => {
  it("data vira o dia-calendário em meia-noite UTC, em qualquer fuso", () => {
    expect(parseOfx(OFX)[0].data.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
  it("lê o saldo informado pelo banco (LEDGERBAL)", () => {
    const comSaldo = OFX.replace("</BANKTRANLIST>", "</BANKTRANLIST><LEDGERBAL><BALAMT>10500.25<DTASOF>20260131120000[-3:BRT]</LEDGERBAL>");
    const s = parseSaldoOfx(comSaldo);
    expect(s?.saldo).toBe(10500.25);
    expect(s?.data.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
  it("sem LEDGERBAL: null", () => {
    expect(parseSaldoOfx(OFX)).toBeNull();
  });
});
