import { describe, it, expect } from "vitest";
import { TERMOS, tipoTermoPorRole, type TipoTermo } from "./termos";

const TODOS_ROLES = [
  "admin",
  "supervisor",
  "administrativo",
  "clt",
  "estagiario",
  "projetista_pj",
  "freelancer",
  "cliente",
] as const;

describe("tipoTermoPorRole", () => {
  it("mapeia apenas 'cliente' para o termo de cliente", () => {
    expect(tipoTermoPorRole("cliente")).toBe("cliente");
  });

  it("mapeia todos os perfis internos para o termo de colaborador", () => {
    for (const role of TODOS_ROLES) {
      const esperado: TipoTermo = role === "cliente" ? "cliente" : "colaborador";
      expect(tipoTermoPorRole(role)).toBe(esperado);
    }
  });

  it("trata perfil desconhecido como colaborador (não vaza para o termo de cliente)", () => {
    expect(tipoTermoPorRole("perfil_inexistente")).toBe("colaborador");
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
