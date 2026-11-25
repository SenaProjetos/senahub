import { describe, it, expect } from "vitest";
import { TERMOS, preencherTermo, tipoTermoPorTipo } from "./termos";

describe("tipoTermoPorTipo", () => {
  it("externo (cliente do portal) aceita o termo de cliente", () => {
    expect(tipoTermoPorTipo("externo")).toBe("cliente");
  });

  it("interno aceita o termo de colaborador", () => {
    expect(tipoTermoPorTipo("interno")).toBe("colaborador");
  });
});

describe("TERMOS", () => {
  it("tem conteúdo, título e versão para cada tipo", () => {
    for (const tipo of ["colaborador", "cliente"] as const) {
      const termo = TERMOS[tipo];
      expect(termo.titulo).toBeTruthy();
      expect(termo.versao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(termo.conteudo.length).toBeGreaterThan(500);
    }
  });

  // Guarda do acoplamento com `modules/chat/acesso.ts`: se a regra de quem lê as Anotações
  // mudar, este texto (e a versão) precisa mudar junto.
  it("o termo de colaborador declara quem lê as Anotações do chat e veda uso privado", () => {
    const texto = TERMOS.colaborador.conteudo;
    expect(texto).toContain('O espaço de "Anotações" do chat é visível apenas ao próprio Usuário e aos administradores do Sistema');
    expect(texto).toContain("não se destina a guardar arquivos ou informações da vida privada");
  });

  it("o texto declara a mesma versão registrada nos metadados", () => {
    for (const tipo of ["colaborador", "cliente"] as const) {
      const termo = TERMOS[tipo];
      expect(termo.conteudo).toContain(`Versão ${termo.versao}`);
    }
  });
});

describe("termo de obra", () => {
  it("externo com conta de obra aceita o termo de obra; interno nunca", () => {
    expect(tipoTermoPorTipo("externo", true)).toBe("obra");
    expect(tipoTermoPorTipo("interno", true)).toBe("colaborador");
    expect(tipoTermoPorTipo("externo", false)).toBe("cliente");
  });

  it("versão 2026-11-25, declarada no texto", () => {
    expect(TERMOS.obra.versao).toBe("2026-11-25");
    expect(TERMOS.obra.conteudo).toContain("Versão 2026-11-25");
    expect(TERMOS.obra.conteudo.length).toBeGreaterThan(500);
  });

  it("diz para que serve o acesso, que é pessoal e que a prancha vale na revisão vigente", () => {
    const t = TERMOS.obra.conteudo;
    expect(t).toContain("executar a obra");
    expect(t).toContain("intransferível");
    expect(t).toContain("revisão vigente");
  });

  it("os marcadores da empresa são preenchidos como nos outros termos", () => {
    const empresa = {
      razaoSocial: "Sena Projetos Ltda",
      cnpj: "00.000.000/0001-00",
      endereco: "Rua X, 1 — Recife/PE",
      encarregadoDados: "dpo@exemplo.com",
      foro: "Recife/PE",
    };
    const t = preencherTermo(TERMOS.obra, empresa).conteudo;
    expect(t).not.toMatch(/\[(RAZÃO SOCIAL COMPLETA|CNPJ|ENDEREÇO[^\]]*|NOME\/E-MAIL DO ENCARREGADO \(DPO\)|COMARCA[^\]]*)\]/);
    expect(t).toContain("Sena Projetos Ltda");
  });
});
