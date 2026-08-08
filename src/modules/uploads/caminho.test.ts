import { describe, it, expect } from "vitest";
import { baseDirDisciplina, nomeFisico } from "@/modules/uploads/caminho";

const PROJETO = {
  ano: 2026,
  clienteNome: "Incorporadora Beta S.A.",
  projetoCodigo: "260004",
  projetoNome: "Ed. Comercial Faria Lima",
};

describe("baseDirDisciplina", () => {
  it("usa a sigla do catálogo no segmento da disciplina", () => {
    expect(
      baseDirDisciplina({ ...PROJETO, disciplinaNome: "Estrutural", siglaDisciplina: "EST" }),
    ).toBe("2026/Incorporadora_Beta_S.A./260004_Ed._Comercial_Faria_Lima/EST");
  });

  it("cai no nome inteiro quando a disciplina não tem sigla", () => {
    expect(
      baseDirDisciplina({ ...PROJETO, disciplinaNome: "Climatização (AVAC)", siglaDisciplina: null }),
    ).toBe("2026/Incorporadora_Beta_S.A./260004_Ed._Comercial_Faria_Lima/Climatizacao_AVAC");
  });

  it("remove acento e caractere perigoso de cada segmento", () => {
    expect(
      baseDirDisciplina({
        ano: 2026,
        clienteNome: "Construções Água/Céu",
        projetoCodigo: "260099",
        projetoNome: "Obra ../etc",
        disciplinaNome: "Gás",
        siglaDisciplina: null,
      }),
    ).toBe("2026/Construcoes_Agua_Ceu/260099_Obra_.._etc/Gas");
  });
});

describe("nomeFisico", () => {
  it("prefixa com a sigla e normaliza o nome do cliente", () => {
    expect(nomeFisico({ nomeArquivo: "Planta Baixa.dwg", siglaDisciplina: "ELE", versao: 1 })).toBe(
      "ELE-Planta_Baixa.dwg",
    );
  });

  it("sem sigla, mantém só o slug", () => {
    expect(nomeFisico({ nomeArquivo: "Planta Baixa.dwg", siglaDisciplina: null, versao: 1 })).toBe(
      "Planta_Baixa.dwg",
    );
  });

  it("versão > 1 recebe sufixo __vN antes da extensão", () => {
    expect(nomeFisico({ nomeArquivo: "planta.dwg", siglaDisciplina: "ELE", versao: 3 })).toBe(
      "ELE-planta__v3.dwg",
    );
  });

  it("extensão sai em minúsculas", () => {
    expect(nomeFisico({ nomeArquivo: "Memorial.PDF", siglaDisciplina: "EST", versao: 1 })).toBe(
      "EST-Memorial.pdf",
    );
  });

  it("arquivo sem extensão não ganha ponto solto", () => {
    expect(nomeFisico({ nomeArquivo: "backup", siglaDisciplina: "EST", versao: 2 })).toBe(
      "EST-backup__v2",
    );
  });

  it("extensão dupla do auto-store (.shcalc.json) é preservada", () => {
    expect(
      nomeFisico({ nomeArquivo: "calc-viga-v1.shcalc.json", siglaDisciplina: "EST", versao: 1 }),
    ).toBe("EST-calc-viga-v1.shcalc.json");
  });

  it("trunca o nome-base em 120 caracteres (limite do slug)", () => {
    const nome = `${"a".repeat(200)}.dwg`;
    const saida = nomeFisico({ nomeArquivo: nome, siglaDisciplina: "EST", versao: 1 });
    expect(saida).toBe(`EST-${"a".repeat(120)}.dwg`);
  });
});
