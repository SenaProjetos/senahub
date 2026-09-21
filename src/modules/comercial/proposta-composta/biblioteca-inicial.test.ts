import { describe, expect, it } from "vitest";
import { CLAUSULAS_INICIAIS, MODELOS_INICIAIS } from "./biblioteca-inicial";
import { escalaresDaProposta, tokensNaoResolvidosProposta } from "./campos";
import { calcularParcelas } from "./parcelas";
import { escolherClausula } from "./clausulas";
import { resolverSecoesDoModelo, ROTULO_SECAO, SECOES_ORDEM } from "./modelos";

/**
 * A semente é create-only por slug: o que entrar errado NÃO se corrige sozinho em produção — vai
 * para dentro de propostas enviadas a clientes e, depois que a gestão editar a biblioteca, sai
 * caro reconciliar. Estes testes são a revisão automática do corpus antes de ele existir no banco.
 */

const TEXTOS = CLAUSULAS_INICIAIS.map((c) => `${c.slug}: ${c.texto}`);

describe("nenhum dado da empresa entra no texto das cláusulas", () => {
  /**
   * §3.4 da análise: circulavam DOIS e-mails e DUAS contas bancárias, porque proposta copiada
   * levava o dado junto. Os campos agora vivem em `empresa.dados` e são lidos na impressão. O
   * corpus extraído das 163 propostas TEM esse vazamento (o rodapé com telefone e e-mail entrou
   * no meio de várias cláusulas), então a semente é varrida antes de virar banco.
   */
  const PADROES: { nome: string; re: RegExp }[] = [
    { nome: "e-mail", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
    { nome: "CNPJ", re: /\d{2}[.\s]?\d{3}[.\s]?\d{3}[./\s]?\d{4}[-\s]?\d{2}/ },
    { nome: "telefone", re: /\(?\d{2}\)?[\s-]?\d{4,5}-\d{4}/ },
    { nome: "agência/conta", re: /\b(ag[êe]ncia|ag\.)\s*\d/i },
    { nome: "chave PIX", re: /\bpix\b/i },
    { nome: "razão social", re: /sena\s+(estruturas|projetos)/i },
  ];

  for (const { nome, re } of PADROES) {
    it(`sem ${nome}`, () => {
      expect(TEXTOS.filter((t) => re.test(t))).toEqual([]);
    });
  }

  it("sem valor em reais escrito no texto (valor é dado, não cláusula)", () => {
    expect(TEXTOS.filter((t) => /R\$\s*\d/.test(t))).toEqual([]);
  });
});

describe("todo token citado existe no catálogo e resolve", () => {
  /**
   * `resolverTextoProposta` RECUSA texto com token desconhecido ou vazio. Se uma cláusula da
   * semente citar `[Banco]` ou `[cidade]`, ninguém descobre agora: descobre na hora de montar a
   * proposta, longe da causa. Aqui o corpus é resolvido contra uma proposta completa fictícia.
   */
  const completa = escalaresDaProposta({
    numero: "PR-260001",
    cliente: "Cliente Exemplo",
    titulo: "Projetos",
    obraEndereco: "Rua Exemplo, 100",
    obraCidade: "Maceió",
    obraUF: "AL",
    areaM2: 500,
    total: 20_000,
    validadeDias: 30,
  });

  it("nenhum token desconhecido nem sem valor", () => {
    const problemas = CLAUSULAS_INICIAIS.flatMap((c) =>
      tokensNaoResolvidosProposta(c.texto, completa).map((p) => `${c.slug}: [${p.token}] (${p.motivo})`),
    );
    expect(problemas).toEqual([]);
  });
});

describe("integridade da biblioteca", () => {
  it("slugs são únicos (o slug é o contrato do create-only)", () => {
    const slugs = CLAUSULAS_INICIAIS.map((c) => c.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
    const modelos = MODELOS_INICIAIS.map((m) => m.slug);
    expect(modelos.length).toBe(new Set(modelos).size);
  });

  it("slug é estável: minúsculas, hífen, sem acento", () => {
    for (const c of [...CLAUSULAS_INICIAIS, ...MODELOS_INICIAIS]) {
      expect(c.slug, c.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("toda seção usada existe no enum", () => {
    for (const c of CLAUSULAS_INICIAIS) expect(SECOES_ORDEM).toContain(c.secao);
    for (const m of MODELOS_INICIAIS) for (const s of m.secoes) expect(SECOES_ORDEM).toContain(s.secao);
  });

  it("UF, quando existe, tem 2 letras maiúsculas", () => {
    for (const c of CLAUSULAS_INICIAIS.filter((x) => x.uf)) expect(c.uf, c.slug).toMatch(/^[A-Z]{2}$/);
  });

  it("texto não tem espaço duplo nem sobra de quebra do PDF extraído", () => {
    for (const c of CLAUSULAS_INICIAIS) {
      expect(c.texto, c.slug).not.toMatch(/ {2}/);
      // "pré- forma", "redimensionam entos": a extração do PDF quebrava palavras.
      expect(c.texto, c.slug).not.toMatch(/\w- \w/);
      expect(c.texto.trim(), c.slug).toBe(c.texto);
    }
  });
});

describe("cláusulas com variante por UF", () => {
  const candidatas = CLAUSULAS_INICIAIS.map((c, i) => ({
    id: c.slug,
    secao: c.secao as string,
    disciplinaId: c.disciplina ?? null,
    uf: c.uf ?? null,
    ordem: c.ordem,
    ativo: true,
    _i: i,
  }));

  it("toda cláusula presa a uma UF tem irmã genérica (senão o outro estado fica sem texto)", () => {
    for (const c of CLAUSULAS_INICIAIS.filter((x) => x.uf)) {
      const generica = CLAUSULAS_INICIAIS.find(
        (o) => o.secao === c.secao && (o.disciplina ?? null) === (c.disciplina ?? null) && !o.uf,
      );
      expect(generica, `${c.slug} não tem variante genérica`).toBeTruthy();
    }
  });

  it("o caso real: obra em AL recebe a genérica de PCI, nunca o COSCIP de Pernambuco", () => {
    const emAL = escolherClausula(candidatas, "escopo", "Incêndio (PPCI)", "AL");
    expect(emAL?.id).toBe("escopo-pci");
    const emPE = escolherClausula(candidatas, "escopo", "Incêndio (PPCI)", "PE");
    expect(emPE?.id).toBe("escopo-pci-pe");
  });

  it("elétrico em PE cita a Neoenergia; fora de PE, a concessionária local sem nome", () => {
    expect(escolherClausula(candidatas, "escopo", "Elétrico", "PE")?.id).toBe("escopo-eletrico-pe");
    expect(escolherClausula(candidatas, "escopo", "Elétrico", "BA")?.id).toBe("escopo-eletrico");
  });

  it("só a variante de PE nomeia concessionária ou código estadual", () => {
    for (const c of CLAUSULAS_INICIAIS.filter((x) => !x.uf)) {
      expect(c.texto, c.slug).not.toMatch(/neoenergia|coscip|equatorial|celpe/i);
    }
  });
});

describe("modelos", () => {
  const disponiveis = CLAUSULAS_INICIAIS.map((c) => ({ slug: c.slug, texto: c.texto, titulo: c.titulo, ativo: true }));

  it("todo slug citado por um modelo existe na biblioteca", () => {
    for (const m of MODELOS_INICIAIS) {
      const r = resolverSecoesDoModelo(m.secoes, disponiveis);
      expect(r.problemas, m.slug).toEqual([]);
      expect(r.jsonInvalido).toBe(false);
      expect(r.secoes.every((s) => s.texto.length > 0), m.slug).toBe(true);
    }
  });

  it("as seções saem na ordem do modelo, com rótulo", () => {
    const r = resolverSecoesDoModelo(MODELOS_INICIAIS[0].secoes, disponiveis);
    expect(r.secoes.map((s) => s.ordem)).toEqual([...r.secoes.map((s) => s.ordem)].sort((a, b) => a - b));
    expect(r.secoes[0].titulo).toBe(ROTULO_SECAO.descricao);
  });

  it("todo plano de pagamento sugerido fecha 100% (é a regra que o editor vai aplicar)", () => {
    for (const m of MODELOS_INICIAIS) {
      const r = calcularParcelas(100_000, m.pagamento);
      expect(r.ok, `${m.slug}: ${r.ok ? "" : r.mensagem}`).toBe(true);
    }
  });

  it("validade é um prazo plausível, em dias", () => {
    for (const m of MODELOS_INICIAIS) {
      expect(m.validadeDias, m.slug).toBeGreaterThanOrEqual(5);
      expect(m.validadeDias, m.slug).toBeLessThanOrEqual(180);
    }
  });

  it("todo modelo tem ao menos as competências e o não incluso (as cláusulas de proteção)", () => {
    for (const m of MODELOS_INICIAIS) {
      const secoes = m.secoes.map((s) => s.secao);
      expect(secoes, m.slug).toContain("nao_incluso");
      expect(secoes, m.slug).toContain("competencia_contratada");
      expect(secoes, m.slug).toContain("competencia_contratante");
    }
  });
});
