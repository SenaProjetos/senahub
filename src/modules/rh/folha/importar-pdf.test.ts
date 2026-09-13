import { describe, expect, it } from "vitest";
import { checarChecksum, codigosRubricaDoImport, parsearTextoFolha } from "./importar-pdf";

/**
 * Fixtures = texto real extraído dos 4 PDFs que o dono enviou (05 a 08/2026, mesma empresa,
 * mesmo contador) — não são sintéticos. Servem exatamente pro propósito do plano: provar que o
 * parser aguenta a ordem estranha (rótulo/valor intercalados) igual nos 4 meses, com e sem
 * quebra de página, com e sem a rubrica dinâmica 081.
 */

const AGO_2026 = `
Empresa : SENA ESTRUTURAS E INSTALACOES EIRELI 00317
End. :
Ref.:
(
Rua Arnóbio Marques, 253 sala 908 emp eng jose camilo brito
)
01/08/2026 31/08/2026 a Dpto :
Página : 00001
Código Nome Ref. Sal. Contratual Adicionais Descontos Líquido
TODOS
Recibo
FOLHA DE PAGAMENTO
CNPJ/CEI: 38090198000114
000003 GICELLY OLIVEIRA DA SILVA 3.646,65 003 0000
Admissão :23/03/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnico em Eletrotécnica
001 Salário Base 3.646,65 220:00
903 INSS Folha 326,18
***************
____/____/______
3.646,65 326,18 3.320,47
Base INSS: 3.646,65 (Aliq.: 8,9446%) Base FGTS: 3.646,65 (Valor: 291,73) Base IRRF Folha: 3.039,45
000002 JOAO VICTOR DOS SANTOS FERREIRA 1.771,23 002 0000
Admissão :01/07/2025
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Auxiliar técnico de engenharia I
FERIAS de 31/08/2026 até 29/09/2026 Dia(s) 1 (007:20)
001 Salário Base 1.712,19 212:40
903 INSS Folha 130,96
***************
____/____/______
1.712,19 130,96 1.581,23
Base INSS: 1.712,19 (Aliq.: 7,6419%) Base FGTS: 1.712,19 (Valor: 136,97) Base IRRF Folha: 1.104,99
000004 MIRELI BARBOSA DA SILVA 3.646,65 004 0000
Admissão :07/04/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica em Edificações Junior
001 Salário Base 3.646,65 220:00
903 INSS Folha 326,18
***************
____/____/______
3.646,65 326,18 3.320,47
Base INSS: 3.646,65 (Aliq.: 8,9446%) Base FGTS: 3.646,65 (Valor: 291,73) Base IRRF Folha: 3.039,45
000001 VANESSA BUARQUE VASCONCELOS 2.604,75 001 0000
Admissão :24/10/2022
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :AUXILIAR ADMINISTRATIVO
FERIAS de 03/08/2026 até 01/09/2026 Dia(s) 29 (212:40)
001 Salário Base 86,83 007:20
604 Vale Transporte 5,21
903 INSS Folha 10,42
***************
____/____/______
86,83 15,63 71,20
Base INSS: 86,84 (Aliq.: 8,7649%) Base FGTS: 86,83 (Valor: 6,94)
000005 YASMIM RAQUEL MATIAS FERREIRA GOMES 4.167,60 005 0000
Admissão :01/05/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica Pleno
001 Salário Base 4.167,60 220:00
903 INSS Folha 388,70
***************
____/____/______
4.167,60 388,70 3.778,90
Base INSS: 4.167,60 (Aliq.: 9,3267%) Base FGTS: 4.167,60 (Valor: 333,40) Base IRRF Folha: 3.560,40
Empresa : SENA ESTRUTURAS E INSTALACOES EIRELI 00317
End. :
Ref.:
(
Rua Arnóbio Marques, 253 sala 908 emp eng jose camilo brito
)
01/08/2026 31/08/2026 a Dpto :
Página : 00002
Código Nome Ref. Sal. Contratual Adicionais Descontos Líquido
TODOS
Recibo
FOLHA DE PAGAMENTO
CNPJ/CEI: 38090198000114
*********************
*********************
Resumo da folha
Total Geral da Folha
( - ) Total de Descontos
( = ) Total Líquido *********************
Informações adicionais
Total Funcionários
Total INSS
Total FGTS
Total IRRF
13.259,92
** Empresa Optante pelo Super Simples - ( Lei Complementar 123/96 ) **
Total Cotas Sal. Família
1.187,65
12.072,27
5
0
1.182,44
1.060,77
0,00
`;

const MAI_2026 = `
Empresa : SENA ESTRUTURAS E INSTALACOES EIRELI 00317
End. :
Ref.:
(
Rua Arnóbio Marques, 253 sala 908 emp eng jose camilo brito
)
01/05/2026 31/05/2026 a Dpto :
Página : 00001
Código Nome Ref. Sal. Contratual Adicionais Descontos Líquido
TODOS
Recibo
FOLHA DE PAGAMENTO
CNPJ/CEI: 38090198000114
000003 GICELLY OLIVEIRA DA SILVA 3.500,00 003 0000
Admissão :23/03/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnico em Eletrotécnica
001 Salário Base 3.500,00 220:00
903 INSS Folha 308,58
***************
____/____/______
3.500,00 308,58 3.191,42
Base INSS: 3.500,00 (Aliq.: 8,8165%) Base FGTS: 3.500,00 (Valor: 280,00) Base IRRF Folha: 2.892,80
000002 JOAO VICTOR DOS SANTOS FERREIRA 1.700,00 002 0000
Admissão :01/07/2025
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Auxiliar técnico de engenharia I
001 Salário Base 1.700,00 220:00
903 INSS Folha 128,68
***************
____/____/______
1.700,00 128,68 1.571,32
Base INSS: 1.700,00 (Aliq.: 7,5694%) Base FGTS: 1.700,00 (Valor: 136,00) Base IRRF Folha: 1.092,80
000004 MIRELI BARBOSA DA SILVA 3.500,00 004 0000
Admissão :07/04/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica em Edificações Junior
001 Salário Base 3.500,00 220:00
903 INSS Folha 308,58
***************
____/____/______
3.500,00 308,58 3.191,42
Base INSS: 3.500,00 (Aliq.: 8,8165%) Base FGTS: 3.500,00 (Valor: 280,00) Base IRRF Folha: 2.892,80
000001 VANESSA BUARQUE VASCONCELOS 2.500,00 001 0000
Admissão :24/10/2022
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :AUXILIAR ADMINISTRATIVO
001 Salário Base 2.500,00 220:00
604 Vale Transporte 150,00
903 INSS Folha 200,68
***************
____/____/______
2.500,00 350,68 2.149,32
Base INSS: 2.500,00 (Aliq.: 8,0272%) Base FGTS: 2.500,00 (Valor: 200,00) Base IRRF Folha: 1.892,80
000005 YASMIM RAQUEL MATIAS FERREIRA GOMES 4.000,00 005 0000
Admissão :01/05/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica Pleno
001 Salário Base 4.000,00 220:00
903 INSS Folha 368,58
***************
____/____/______
4.000,00 368,58 3.631,42
Base INSS: 4.000,00 (Aliq.: 9,2145%) Base FGTS: 4.000,00 (Valor: 320,00) Base IRRF Folha: 3.392,80
*********************
*********************
Resumo da folha
Total Geral da Folha
( - ) Total de Descontos
( = ) Total Líquido *********************
Informações adicionais
Total Funcionários
Total INSS
Total FGTS
Total IRRF
15.200,00
** Empresa Optante pelo Super Simples - ( Lei Complementar 123/96 ) **
Total Cotas Sal. Família
1.465,10
13.734,90
5
0
1.315,10
1.216,00
0,00
`;

const JUN_2026 = `
Empresa : SENA ESTRUTURAS E INSTALACOES EIRELI 00317
End. :
Ref.:
(
Rua Arnóbio Marques, 253 sala 908 emp eng jose camilo brito
)
01/06/2026 30/06/2026 a Dpto :
Página : 00001
Código Nome Ref. Sal. Contratual Adicionais Descontos Líquido
TODOS
Recibo
FOLHA DE PAGAMENTO
CNPJ/CEI: 38090198000114
000003 GICELLY OLIVEIRA DA SILVA 3.646,65 003 0000
Admissão :23/03/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnico em Eletrotécnica
001 Salário Base 3.646,65 220:00
081 diferença salarial 05/2026 146,65
903 INSS Folha 343,78
***************
____/____/______
3.793,30 343,78 3.449,52
Base INSS: 3.793,30 (Aliq.: 9,0628%) Base FGTS: 3.793,30 (Valor: 303,46) Base IRRF Folha: 3.186,10
000002 JOAO VICTOR DOS SANTOS FERREIRA 1.771,23 002 0000
Admissão :01/07/2025
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Auxiliar técnico de engenharia I
001 Salário Base 1.771,23 220:00
081 diferença salarial 05/2026 71,23
903 INSS Folha 141,50
***************
____/____/______
1.842,46 141,50 1.700,96
Base INSS: 1.842,46 (Aliq.: 7,6799%) Base FGTS: 1.842,46 (Valor: 147,39) Base IRRF Folha: 1.235,26
000004 MIRELI BARBOSA DA SILVA 3.646,65 004 0000
Admissão :07/04/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica em Edificações Junior
001 Salário Base 3.646,65 220:00
081 diferença salarial 05/2026 146,65
903 INSS Folha 343,78
***************
____/____/______
3.793,30 343,78 3.449,52
Base INSS: 3.793,30 (Aliq.: 9,0628%) Base FGTS: 3.793,30 (Valor: 303,46) Base IRRF Folha: 3.186,10
000001 VANESSA BUARQUE VASCONCELOS 2.604,75 001 0000
Admissão :24/10/2022
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :AUXILIAR ADMINISTRATIVO
001 Salário Base 2.604,75 220:00
081 diferença salarial 05/2026 104,75
604 Vale Transporte 156,29
903 INSS Folha 219,53
***************
____/____/______
2.709,50 375,82 2.333,68
Base INSS: 2.709,50 (Aliq.: 8,1022%) Base FGTS: 2.709,50 (Valor: 216,76) Base IRRF Folha: 2.102,30
000005 YASMIM RAQUEL MATIAS FERREIRA GOMES 4.167,60 005 0000
Admissão :01/05/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica Pleno
001 Salário Base 4.167,60 220:00
081 diferença salarial 05/2026 167,60
903 INSS Folha 408,81
***************
____/____/______
4.335,20 408,81 3.926,39
Base INSS: 4.335,20 (Aliq.: 9,43%) Base FGTS: 4.335,20 (Valor: 346,81) Base IRRF Folha: 3.728,00
Empresa : SENA ESTRUTURAS E INSTALACOES EIRELI 00317
End. :
Ref.:
(
Rua Arnóbio Marques, 253 sala 908 emp eng jose camilo brito
)
01/06/2026 30/06/2026 a Dpto :
Página : 00002
Código Nome Ref. Sal. Contratual Adicionais Descontos Líquido
TODOS
Recibo
FOLHA DE PAGAMENTO
CNPJ/CEI: 38090198000114
*********************
*********************
Resumo da folha
Total Geral da Folha
( - ) Total de Descontos
( = ) Total Líquido *********************
Informações adicionais
Total Funcionários
Total INSS
Total FGTS
Total IRRF
16.473,76
** Empresa Optante pelo Super Simples - ( Lei Complementar 123/96 ) **
Total Cotas Sal. Família
1.613,69
14.860,07
5
0
1.457,40
1.317,88
0,00
`;

const JUL_2026 = `
Empresa : SENA ESTRUTURAS E INSTALACOES EIRELI 00317
End. :
Ref.:
(
Rua Arnóbio Marques, 253 sala 908 emp eng jose camilo brito
)
01/07/2026 31/07/2026 a Dpto :
Página : 00001
Código Nome Ref. Sal. Contratual Adicionais Descontos Líquido
TODOS
Recibo
FOLHA DE PAGAMENTO
CNPJ/CEI: 38090198000114
000003 GICELLY OLIVEIRA DA SILVA 3.646,65 003 0000
Admissão :23/03/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnico em Eletrotécnica
001 Salário Base 3.646,65 220:00
903 INSS Folha 326,18
***************
____/____/______
3.646,65 326,18 3.320,47
Base INSS: 3.646,65 (Aliq.: 8,9446%) Base FGTS: 3.646,65 (Valor: 291,73) Base IRRF Folha: 3.039,45
000002 JOAO VICTOR DOS SANTOS FERREIRA 1.771,23 002 0000
Admissão :01/07/2025
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Auxiliar técnico de engenharia I
001 Salário Base 1.771,23 220:00
903 INSS Folha 135,09
***************
____/____/______
1.771,23 135,09 1.636,14
Base INSS: 1.771,23 (Aliq.: 7,6269%) Base FGTS: 1.771,23 (Valor: 141,69) Base IRRF Folha: 1.164,03
000004 MIRELI BARBOSA DA SILVA 3.646,65 004 0000
Admissão :07/04/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica em Edificações Junior
001 Salário Base 3.646,65 220:00
903 INSS Folha 326,18
***************
____/____/______
3.646,65 326,18 3.320,47
Base INSS: 3.646,65 (Aliq.: 8,9446%) Base FGTS: 3.646,65 (Valor: 291,73) Base IRRF Folha: 3.039,45
000001 VANESSA BUARQUE VASCONCELOS 2.604,75 001 0000
Admissão :24/10/2022
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :AUXILIAR ADMINISTRATIVO
001 Salário Base 2.604,75 220:00
604 Vale Transporte 156,29
903 INSS Folha 210,10
***************
____/____/______
2.604,75 366,39 2.238,36
Base INSS: 2.604,75 (Aliq.: 8,066%) Base FGTS: 2.604,75 (Valor: 208,38) Base IRRF Folha: 1.997,55
000005 YASMIM RAQUEL MATIAS FERREIRA GOMES 4.167,60 005 0000
Admissão :01/05/2026
Livro: Folha. :
Dep IR : Dep SF : 0 0
Função :Técnica Pleno
001 Salário Base 4.167,60 220:00
903 INSS Folha 388,70
***************
____/____/______
4.167,60 388,70 3.778,90
Base INSS: 4.167,60 (Aliq.: 9,3267%) Base FGTS: 4.167,60 (Valor: 333,40) Base IRRF Folha: 3.560,40
*********************
*********************
Resumo da folha
Total Geral da Folha
( - ) Total de Descontos
( = ) Total Líquido *********************
Informações adicionais
Total Funcionários
Total INSS
Total FGTS
Total IRRF
15.836,88
** Empresa Optante pelo Super Simples - ( Lei Complementar 123/96 ) **
Total Cotas Sal. Família
1.542,54
14.294,34
5
0
1.386,25
1.266,93
0,00
`;

describe("parsearTextoFolha", () => {
  it("parseia agosto/2026 (2 páginas, sem rubrica dinâmica)", () => {
    const folha = parsearTextoFolha(AGO_2026);
    expect(folha.ano).toBe(2026);
    expect(folha.mes).toBe(8);
    expect(folha.funcionarios).toHaveLength(5);

    const gicelly = folha.funcionarios.find((f) => f.matriculaExterna === "000003")!;
    expect(gicelly.nome).toBe("GICELLY OLIVEIRA DA SILVA");
    expect(gicelly.salarioContratual).toBeCloseTo(3646.65);
    expect(gicelly.rubricas).toEqual([
      { codigoExterno: "001", descricao: "Salário Base", valor: 3646.65 },
      { codigoExterno: "903", descricao: "INSS Folha", valor: 326.18 },
    ]);
    expect(gicelly.liquido).toBeCloseTo(3320.47);

    // Vanessa: 3 rubricas (001 provento, 604+903 desconto) — a única com Vale Transporte
    // fora de junho, e cujo "Base IRRF Folha" nem aparece no PDF (líquido < isento).
    const vanessa = folha.funcionarios.find((f) => f.matriculaExterna === "000001")!;
    expect(vanessa.rubricas.map((r) => r.codigoExterno)).toEqual(["001", "604", "903"]);
    expect(vanessa.totalProventos).toBeCloseTo(86.83);
    expect(vanessa.totalDescontos).toBeCloseTo(15.63);
    expect(vanessa.liquido).toBeCloseTo(71.2);

    expect(folha.resumo).toEqual({
      totalGeral: 13259.92,
      totalDescontos: 1187.65,
      totalLiquido: 12072.27,
      totalFuncionarios: 5,
      totalCotasSalFamilia: 0,
      totalINSS: 1182.44,
      totalFGTS: 1060.77,
      totalIRRF: 0,
    });
    expect(checarChecksum(folha)).toEqual({ ok: true });
  });

  it("parseia maio/2026 (1 página só, resumo emendado no fim do mesmo bloco)", () => {
    const folha = parsearTextoFolha(MAI_2026);
    expect(folha.ano).toBe(2026);
    expect(folha.mes).toBe(5);
    expect(folha.funcionarios).toHaveLength(5);
    expect(folha.resumo.totalGeral).toBeCloseTo(15200.0);
    expect(folha.resumo.totalLiquido).toBeCloseTo(13734.9);
    expect(checarChecksum(folha)).toEqual({ ok: true });
  });

  it("parseia junho/2026 (rubrica dinâmica 081, descrição muda todo mês)", () => {
    const folha = parsearTextoFolha(JUN_2026);
    expect(folha.mes).toBe(6);

    const gicelly = folha.funcionarios.find((f) => f.matriculaExterna === "000003")!;
    expect(gicelly.rubricas).toEqual([
      { codigoExterno: "001", descricao: "Salário Base", valor: 3646.65 },
      { codigoExterno: "081", descricao: "diferença salarial 05/2026", valor: 146.65 },
      { codigoExterno: "903", descricao: "INSS Folha", valor: 343.78 },
    ]);
    // Provento composto (001+081) precisa bater no total da linha do funcionário.
    expect(gicelly.totalProventos).toBeCloseTo(3793.3);

    expect(codigosRubricaDoImport(folha).sort()).toEqual(["001", "081", "604", "903"]);
    expect(checarChecksum(folha)).toEqual({ ok: true });
  });

  it("parseia julho/2026 (volta ao normal, sem 081)", () => {
    const folha = parsearTextoFolha(JUL_2026);
    expect(folha.mes).toBe(7);
    expect(codigosRubricaDoImport(folha).sort()).toEqual(["001", "604", "903"]);
    expect(checarChecksum(folha)).toEqual({ ok: true });
  });

  it("lança erro claro quando não acha nenhum funcionário", () => {
    expect(() => parsearTextoFolha("texto qualquer sem nada reconhecível")).toThrow(
      /período da folha/,
    );
  });

  it("lança erro claro quando o período existe mas nenhum funcionário bate", () => {
    const soCabecalho = "01/08/2026 31/08/2026 a Dpto :\nResumo da folha\n";
    expect(() => parsearTextoFolha(soCabecalho)).toThrow(/nenhum funcionário/);
  });

  it("recusa período que não é mês cheio (início e fim em meses diferentes)", () => {
    const periodoQuebrado = "01/08/2026 15/09/2026 a Dpto :\n";
    expect(() => parsearTextoFolha(periodoQuebrado)).toThrow(/não é um mês cheio/);
  });

  it("recusa resumo cuja aritmética interna não fecha (janela de leitura deslizou)", () => {
    // Troca o Total Geral por um valor que não bate mais com Descontos - Líquido — mesmo
    // sintoma de um 9º total futuro empurrando a leitura posicional uma casa.
    const resumoQuebrado = AGO_2026.replace("13.259,92", "999,99");
    expect(() => parsearTextoFolha(resumoQuebrado)).toThrow(/Resumo da folha inconsistente/);
  });
});

describe("checarChecksum", () => {
  it("recusa quando a soma dos líquidos não bate com o Total Líquido do PDF", () => {
    const folha = parsearTextoFolha(AGO_2026);
    const adulterada = { ...folha, resumo: { ...folha.resumo, totalLiquido: folha.resumo.totalLiquido + 10 } };
    const resultado = checarChecksum(adulterada);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.motivo).toMatch(/não bate/);
  });

  it("recusa quando a contagem de funcionários não bate", () => {
    const folha = parsearTextoFolha(AGO_2026);
    const adulterada = { ...folha, funcionarios: folha.funcionarios.slice(0, 4) };
    const resultado = checarChecksum(adulterada);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.motivo).toMatch(/funcionário/);
  });

  it("recusa quando a linha de totais de um funcionário não bate com NENHUMA divisão das rubricas", () => {
    // Corrompe só o INSS da Gicelly no texto (mantém a linha de totais dela intacta) — prova
    // que essa checagem existe INDEPENDENTE da soma de líquidos: como `liquido` é lido direto
    // do PDF (não recalculado), a soma geral continua batendo — só a reconciliação por
    // funcionário pega esse tipo de erro (achado do advisor).
    const rubricaCorrompida = AGO_2026.replace("903 INSS Folha 326,18", "903 INSS Folha 999,99");
    const folha = parsearTextoFolha(rubricaCorrompida);
    // confirma a premissa: a soma dos líquidos ainda bate, mesmo com a rubrica corrompida.
    const somaLiquidos = folha.funcionarios.reduce((s, f) => s + f.liquido, 0);
    expect(somaLiquidos).toBeCloseTo(folha.resumo.totalLiquido);

    const resultado = checarChecksum(folha);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.motivo).toMatch(/000003.*nenhuma combinação/);
  });
});
