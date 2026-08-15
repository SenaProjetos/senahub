/**
 * Primitivos de deduplicação (F1.12, docs/crm/04-plano-fases.md).
 *
 * Puro — sem I/O. Extraído do protótipo em `scripts/auditoria-crm.ts` (que já validou
 * `normalizarDocumento`/`normalizarNomeEmpresa`/`dominioCorporativo` contra produção — os 3
 * grupos reais de duplicata que `03-migracao.md` §4 documenta vieram exatamente daqui). O
 * script agora importa deste arquivo, em vez de manter uma segunda cópia da mesma lógica.
 *
 * Estas funções só DETECTAM candidato — nunca fundem sozinhas. A decisão de fundir é humana
 * (F1.13: alerta não bloqueante; F1.14: ação de mesclar).
 */

/** Só dígitos: "12.345.678/0001-90" → "12345678000190". */
export function normalizarDocumento(d: string | null): string | null {
  if (!d) return null;
  const so = d.replace(/\D/g, "");
  return so.length > 0 ? so : null;
}

/**
 * Minúsculo, sem acento, sem pontuação, espaços colapsados. Sufixo societário só cai
 * quando o registro é PJ — `Cliente.nome` guarda nome de PESSOA quando `tipo = PF`, e aí
 * "Sá" (→ "sa" depois de tirar o acento) e "Me" seriam comidos como se fossem sufixo.
 *
 * A classe de acento vai escrita em escape (\u0300-\u036f) de propósito: os combining marks
 * literais não sobrevivem a todo round-trip de encoding (este repo já tem comentários
 * corrompidos em prisma/schema.prisma por isso).
 */
export function normalizarNomeEmpresa(nome: string, tipo: "PF" | "PJ" = "PJ"): string {
  const base = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const semSufixo =
    tipo === "PJ" ? base.replace(/\b(ltda|epp|eireli|s\/?a|cia|inc|mei|me)\b/g, "") : base;
  return semSufixo
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Domínio do e-mail, ignorando provedores públicos (não identificam empresa). */
const PROVEDORES_PUBLICOS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br",
  "bol.com.br", "uol.com.br", "terra.com.br", "live.com", "icloud.com", "msn.com",
]);
export function dominioCorporativo(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const d = email.split("@").pop()?.toLowerCase().trim();
  if (!d || PROVEDORES_PUBLICOS.has(d)) return null;
  return d;
}

/**
 * Domínio de uma URL de site, sem protocolo nem "www.". Aceita a URL com ou sem
 * `http(s)://` — "empresa.com.br" e "https://www.empresa.com.br/sobre" viram "empresa.com.br".
 * Não filtra provedor público: um site (diferente de e-mail) já é, por natureza, da empresa.
 */
export function dominioDoSite(url: string | null): string | null {
  if (!url) return null;
  const s = url.trim();
  if (!s) return null;
  const comProtocolo = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const host = new URL(comProtocolo).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null; // não parseável como URL — não inventa domínio de lixo
  }
}

/**
 * Telefone em E.164 (BR): "(81) 99999-9999" → "+5581999999999". Heurística de dedupe, não
 * validação telefônica — o objetivo é casar o MESMO número escrito de formas diferentes, não
 * certificar que o número existe.
 *
 * Aceita: 10-11 dígitos (DDD + local, com ou sem o 9º dígito do celular) → prefixa +55.
 * 12-13 dígitos começando em "55" → já tem código do país, só adiciona o "+".
 * Qualquer outro comprimento: retorna `null` — errar por não normalizar é mais seguro que
 * normalizar errado e casar dois números que não são o mesmo.
 */
export function normalizarTelefone(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length === 0) return null;

  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return `+${digitos}`;
  }
  if (digitos.length === 10 || digitos.length === 11) {
    return `+55${digitos}`;
  }
  return null;
}

/** Distância de Levenshtein (nº mínimo de edições para transformar `a` em `b`). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const linha = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) linha[j] = j;

  for (let i = 1; i <= m; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = linha[j];
      linha[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, linha[j], linha[j - 1]);
      anterior = temp;
    }
  }
  return linha[n];
}

/**
 * Similaridade entre duas strings, de 0 (nada em comum) a 1 (idênticas), via distância de
 * Levenshtein normalizada pelo tamanho da maior string.
 *
 * Aplicar SEMPRE depois de normalizar (`normalizarNomeEmpresa`) — é a camada de "quase igual"
 * para o que a normalização exata não pega: erro de digitação, abreviação, plural. Comparar
 * strings cruas (com acentuação/caixa diferentes) polui o score com diferença que não é
 * realmente dúvida de duplicata.
 */
export function similaridade(a: string, b: string): number {
  const tamanhoMax = Math.max(a.length, b.length);
  if (tamanhoMax === 0) return 1;
  return 1 - levenshtein(a, b) / tamanhoMax;
}

// ── Busca de candidatos (F1.13) ─────────────────────────────────────────────

export type ClienteResumoDedupe = {
  id: string;
  nome: string;
  tipo: "PF" | "PJ";
  documento: string | null;
  email: string | null;
};

export type MotivoCandidato = "documento" | "nome_exato" | "nome_similar" | "email";

export type CandidatoDuplicata = {
  cliente: ClienteResumoDedupe;
  motivo: MotivoCandidato;
  /** 1 para match exato (documento/nome/e-mail); a similaridade de fato só para `nome_similar`. */
  score: number;
};

/** Ordem de força de cada motivo — decide qual fica quando o mesmo cliente casa por mais de um. */
const FORCA_MOTIVO: Record<MotivoCandidato, number> = {
  documento: 4,
  nome_exato: 3,
  email: 2,
  nome_similar: 1,
};

/**
 * Candidatos a duplicata de uma Empresa que está sendo digitada AGORA, contra as já
 * cadastradas. Puro: recebe a lista já buscada, não consulta o banco.
 *
 * Não decide nada sozinha — só aponta candidatos, ordenados do mais forte pro mais fraco, pra
 * um alerta NÃO BLOQUEANTE (F1.13). Documento é o sinal mais forte (identidade legal); nome
 * exato e e-mail corporativo em seguida; nome só "parecido" é o mais fraco e o único que usa
 * `similaridade` — os outros três são match exato depois de normalizar.
 */
export function candidatosDuplicata(
  existentes: ClienteResumoDedupe[],
  entrada: {
    nome?: string | null;
    tipo?: "PF" | "PJ";
    documento?: string | null;
    email?: string | null;
  },
  opts: { limiarSimilaridade?: number } = {},
): CandidatoDuplicata[] {
  const limiar = opts.limiarSimilaridade ?? 0.85;
  const tipo = entrada.tipo ?? "PJ";

  const docEntrada = normalizarDocumento(entrada.documento ?? null);
  const nomeEntrada = entrada.nome?.trim() ? normalizarNomeEmpresa(entrada.nome, tipo) : null;
  const dominioEntrada = dominioCorporativo(entrada.email ?? null);

  const porCliente = new Map<string, CandidatoDuplicata>();
  const registra = (cliente: ClienteResumoDedupe, motivo: MotivoCandidato, score: number) => {
    const atual = porCliente.get(cliente.id);
    if (!atual || FORCA_MOTIVO[motivo] > FORCA_MOTIVO[atual.motivo]) {
      porCliente.set(cliente.id, { cliente, motivo, score });
    }
  };

  for (const c of existentes) {
    if (docEntrada && normalizarDocumento(c.documento) === docEntrada) {
      registra(c, "documento", 1);
      continue; // documento já é o sinal mais forte possível — não precisa checar o resto
    }

    if (dominioEntrada && dominioCorporativo(c.email) === dominioEntrada) {
      registra(c, "email", 1);
    }

    if (nomeEntrada) {
      const nomeExistente = normalizarNomeEmpresa(c.nome, c.tipo);
      if (nomeExistente === nomeEntrada) {
        registra(c, "nome_exato", 1);
      } else {
        const s = similaridade(nomeEntrada, nomeExistente);
        if (s >= limiar) registra(c, "nome_similar", s);
      }
    }
  }

  return [...porCliente.values()].sort(
    (a, b) => FORCA_MOTIVO[b.motivo] - FORCA_MOTIVO[a.motivo] || b.score - a.score,
  );
}
