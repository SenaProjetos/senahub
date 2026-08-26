import { LruCache } from "@/lib/cache";
import { soDigitos, validarCNPJ } from "@/lib/documento";
import { porteDoCnpj, type PorteCliente } from "@/modules/clientes/porte";

export type DadosCnpj = {
  nome: string;
  nomeFantasia?: string;
  email?: string;
  telefone?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  porte?: PorteCliente;
};

type RespostaCnpj = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  email?: string | null;
  ddd_telefone_1?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  porte?: string | null;
  codigo_porte?: number | null;
};

const cache = new LruCache<string, DadosCnpj>({ max: 500, ttlMs: 24 * 60 * 60_000 });

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor.trim() || undefined : undefined;
}

function emailValido(email: string | undefined): string | undefined {
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

/**
 * Consulta dados públicos de empresa na BrasilAPI. A resposta é apenas uma sugestão para o
 * formulário: nada é persistido até que a pessoa revise e salve o cadastro.
 */
export async function buscarDadosCnpj(cnpjRaw: string): Promise<DadosCnpj | null> {
  const cnpj = soDigitos(cnpjRaw);
  if (!validarCNPJ(cnpj)) return null;

  const cached = cache.get(cnpj);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: ctrl.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as RespostaCnpj;
    const nome = texto(data.razao_social);
    if (!nome) return null;

    const dados: DadosCnpj = {
      nome,
      nomeFantasia: texto(data.nome_fantasia),
      email: emailValido(texto(data.email)),
      telefone: texto(data.ddd_telefone_1),
      cep: texto(data.cep)?.replace(/\D/g, ""),
      logradouro: texto(data.logradouro),
      numero: texto(data.numero),
      complemento: texto(data.complemento),
      bairro: texto(data.bairro),
      cidade: texto(data.municipio),
      uf: texto(data.uf)?.toUpperCase(),
      porte: porteDoCnpj(data.porte, data.codigo_porte),
    };
    cache.set(cnpj, dados);
    return dados;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
