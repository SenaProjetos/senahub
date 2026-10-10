import { describe, it, expect } from "vitest";
import { TERMOS, tipoTermoPorTipo } from "./termos";

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
