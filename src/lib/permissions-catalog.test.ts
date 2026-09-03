import { describe, expect, it } from "vitest";
import { ehLeitura, PERMISSOES_CATALOGO, telaQueAbre } from "@/lib/permissions-catalog";
import { NAV_GROUPS } from "@/lib/nav-config";

describe("ehLeitura", () => {
  it("reconhece as ações de leitura marcadas", () => {
    expect(ehLeitura("projetos", "ver")).toBe(true);
    expect(ehLeitura("projetos", "historico")).toBe(true);
    expect(ehLeitura("arquivos", "baixar")).toBe(true);
  });

  it("trata ação de escrita como não-leitura", () => {
    expect(ehLeitura("projetos", "gerir")).toBe(false);
    expect(ehLeitura("arquivos", "enviar")).toBe(false);
    expect(ehLeitura("uploads", "validar")).toBe(false);
    expect(ehLeitura("permissoes", "gerir")).toBe(false);
  });

  it("é fail-closed: recurso ou ação desconhecida não é leitura", () => {
    expect(ehLeitura("recurso_que_nao_existe", "ver")).toBe(false);
    expect(ehLeitura("projetos", "acao_que_nao_existe")).toBe(false);
  });

  it("mantém como NÃO-leitura os dois casos de fronteira decididos no §15.7", () => {
    // "Ver e gerar documentos" — gerar persiste arquivo.
    expect(ehLeitura("documentos", "ver")).toBe(false);
    // "Usar ferramentas e salvar cálculos" — salvar persiste.
    expect(ehLeitura("ferramentas", "usar")).toBe(false);
  });

  it("nenhuma ação `gerir` do catálogo está marcada como leitura", () => {
    // Guarda contra marcação distraída: `gerir` é sempre escrita, em qualquer recurso. Isso
    // importa porque o piso de sócio (só leitura, §15.7) é derivado desta classificação.
    for (const r of PERMISSOES_CATALOGO) {
      for (const a of r.acoes) {
        if (a.acao === "gerir") {
          expect(a.leitura ?? false, `${r.recurso}:gerir`).toBe(false);
        }
      }
    }
  });
});

describe("abre (acesso a tela)", () => {
  it("toda permissão exigida pelo menu está marcada como acesso a tela", () => {
    // Guarda de deriva: a tela de Permissões separa "abre tela" de "funcionalidade" a partir
    // de `abre`. Se um item novo do menu passar a exigir `recurso:acao` e ninguém marcar,
    // a matriz vai mentir dizendo que aquilo não dá acesso a nada.
    for (const grupo of NAV_GROUPS) {
      for (const item of grupo.items) {
        if (!item.permissao) continue;
        for (const chave of [item.permissao].flat()) {
          const [recurso, acao] = chave.split(":");
          expect(telaQueAbre(recurso, acao), `${chave} (menu: ${item.title})`).not.toBeNull();
        }
      }
    }
  });

  it("escopo de dados não abre tela nem é confundido com funcionalidade", () => {
    for (const r of PERMISSOES_CATALOGO) {
      for (const a of r.acoes) {
        if (a.dados) expect(a.abre, `${r.recurso}:${a.acao}`).toBeUndefined();
      }
    }
    expect(PERMISSOES_CATALOGO.flatMap((r) => r.acoes.filter((a) => a.dados).map((a) => `${r.recurso}:${a.acao}`)))
      .toEqual(["arquivos:ver_todas_disciplinas", "escopo:global"]);
  });

  it("é fail-closed: ação desconhecida não abre tela", () => {
    expect(telaQueAbre("recurso_que_nao_existe", "ver")).toBeNull();
    expect(telaQueAbre("projetos", "gerir")).toBeNull();
  });
});
