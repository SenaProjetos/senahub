"use client";

import { useRef, useState } from "react";

type Item = { nome: string; status: "enviando" | "ok" | "erro"; motivo?: string };

function fmt(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Envio público (sem login) de arquivos do cliente para a proposta, por token. */
export function PropostaPublicaUpload({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [selecionados, setSelecionados] = useState<File[]>([]);

  async function enviar() {
    const files = selecionados;
    if (files.length === 0) return;
    setEnviando(true);
    const finais: Item[] = files.map((f) => ({ nome: f.name, status: "enviando" }));
    setItens([...finais]);
    for (let i = 0; i < files.length; i++) {
      try {
        const fd = new FormData();
        fd.append("file", files[i]);
        if (nome.trim()) fd.append("enviadoPor", nome.trim());
        const res = await fetch(`/api/t/proposta/${token}/documentos`, { method: "POST", body: fd });
        if (res.ok) {
          finais[i] = { nome: files[i].name, status: "ok" };
        } else {
          const data = await res.json().catch(() => ({}));
          finais[i] = { nome: files[i].name, status: "erro", motivo: data.error ?? `Falha (${res.status})` };
        }
      } catch {
        finais[i] = { nome: files[i].name, status: "erro", motivo: "Falha de conexão." };
      }
      setItens([...finais]);
    }
    setEnviando(false);
    setSelecionados([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="mt-8 rounded-sm border bg-card p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Enviar arquivos</h2>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        Envie plantas, referências ou documentos para este projeto. Ficam disponíveis para a equipe da Sena Projetos.
      </p>

      <div className="space-y-2">
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome (opcional)"
          className="w-full rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => setSelecionados(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-sm file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || selecionados.length === 0}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {enviando ? "Enviando…" : `Enviar${selecionados.length ? ` ${selecionados.length} arquivo(s)` : ""}`}
        </button>
      </div>

      {itens.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {itens.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5">
              <span className="min-w-0 truncate">{it.nome}</span>
              {it.status === "enviando" && <span className="shrink-0 text-xs text-muted-foreground">enviando…</span>}
              {it.status === "ok" && <span className="shrink-0 text-xs text-success">enviado ✓</span>}
              {it.status === "erro" && (
                <span className="shrink-0 text-xs text-destructive" title={it.motivo}>
                  {it.motivo ?? "erro"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {selecionados.length > 0 && !enviando && itens.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {selecionados.length} arquivo(s) selecionado(s) · {fmt(selecionados.reduce((s, f) => s + f.size, 0))}
        </p>
      )}
    </section>
  );
}
