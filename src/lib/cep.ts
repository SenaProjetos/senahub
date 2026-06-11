import { LruCache } from "@/lib/cache";

export type EnderecoCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const cache = new LruCache<string, EnderecoCep>({ max: 500, ttlMs: 24 * 60 * 60_000 });

/** Consulta o ViaCEP (único serviço externo de dados). Cache 24h, timeout 5s. */
export async function buscarCep(cepRaw: string): Promise<EnderecoCep | null> {
  const cep = cepRaw.replace(/\D/g, "");
  if (cep.length !== 8) return null;

  const cached = cache.get(cep);
  if (cached) return cached;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    const endereco: EnderecoCep = {
      cep,
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      cidade: data.localidade ?? "",
      uf: data.uf ?? "",
    };
    cache.set(cep, endereco);
    return endereco;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
