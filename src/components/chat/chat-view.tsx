"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Send, Hash, AtSign, Plus, Circle, Paperclip, X, FileText, Smile,
  Check, CheckCheck, ChevronDown, Pin, PinOff, Pencil, Trash2, Reply,
  Bell, BellOff, ExternalLink, Search, Users, Settings2, Briefcase, Eye,
  ChevronsDownUp, ChevronsUpDown, Mic, Play, Pause, Forward,
} from "lucide-react";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  REGEX_MENCAO_CURSOR,
  partesComMencao,
  inserirMencaoNoTexto,
} from "@/modules/chat/mencoes";
import { getSocket, tocarSom } from "@/lib/chat-client";
import { useChatBadge } from "@/components/chat/chat-badge-context";
import {
  enviarMensagem,
  marcarLido,
  definirStatusChat,
  abrirDM,
  editarMensagem,
  excluirMensagem,
  reagir,
  fixarMensagem,
  silenciarCanal,
  marcarTudoLido,
  criarGrupo,
  adicionarMembroGrupo,
  removerMembroGrupo,
  renomearGrupo,
  definirIconeGrupo,
  encaminharMensagem,
} from "@/modules/chat/actions";
import type { CanalListItem, ReacaoAgregada } from "@/modules/chat/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Msg = {
  id: string;
  conteudo: string;
  anexoMime?: string | null;
  anexoNome?: string | null;
  fixada?: boolean;
  encaminhada?: boolean;
  editedAt?: string | Date | null;
  excluidaEm?: string | Date | null;
  autor: { id: string; name: string };
  createdAt: string | Date;
  leituras?: { userId: string; user: { name: string } }[];
  reacoes?: ReacaoAgregada[];
  respostaA?: { id: string; conteudo: string | null; autor: { name: string } } | null;
};
type Fixada = { id: string; conteudo: string; autor: { name: string } };
type ResultadoBusca = { id: string; canalId: string; conteudo: string; autorNome: string; createdAt: string };
type Usuario = { id: string; name: string; role: string; chatStatus: string };
type ChatStatus = "disponivel" | "ocupado" | "reuniao";

const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  ocupado: "Ocupado",
  reuniao: "Em reunião",
};
const STATUS_COR: Record<string, string> = {
  disponivel: "text-status-aprovado fill-status-aprovado",
  ocupado: "text-status-entregue fill-status-entregue",
  reuniao: "text-status-revisao fill-status-revisao",
};

const SITUACOES_ARQUIVADAS = new Set(["concluido", "arquivado", "cancelado"]);

const EMOJIS = ["👍","🙏","✅","🔥","🎉","😀","😅","😂","🤔","👀","💪","🚀","❤️","👏","🙌","📌","⚠️","✏️","📎","💡","✔️","❌","⏰","📅","💰","📈","🏗️","📐"];
const EMOJIS_REACAO = ["👍","❤️","😂","😮","😢","🔥","🎉","✅","👏","🙌"];

/** Realça @menções no texto da mensagem (suporta acentos via Unicode). */
function renderConteudo(txt: string) {
  return partesComMencao(txt).map((parte, i) =>
    parte.startsWith("@") ? (
      <span key={i} className="font-semibold opacity-90">
        {parte}
      </span>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

function StatusDot({ status, className }: { status?: string; className?: string }) {
  const cor = STATUS_COR[status ?? "disponivel"] ?? STATUS_COR.disponivel;
  return <Circle className={cn("size-2 shrink-0", cor, className)} />;
}

function fmtTempo(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Alturas de barra pseudo-aleatórias estáveis (derivadas do src) p/ a waveform. */
const N_BARRAS = 32;
function ondasDeAudio(seed: string): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < N_BARRAS; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out.push(0.28 + (h % 1000) / 1000 * 0.72); // 0.28 .. 1.0
  }
  return out;
}

/**
 * Player de áudio estilo WhatsApp, integrado ao balão (sem caixa própria). Usa
 * `currentColor`, então adapta às cores do balão (próprio vs. dos outros). Waveform
 * clicável para buscar; mostra o tempo decorrido (ou a duração quando parado).
 */
function AudioPlayer({ src, autorId }: { src: string; autorId: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const barras = useMemo(() => ondasDeAudio(src), [src]);

  // Progresso fluido: `timeupdate` dispara ~4x/s (trava em áudios curtos). Enquanto
  // toca, lemos currentTime a cada frame (~60fps) para um movimento suave.
  useEffect(() => {
    if (!tocando) return;
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) setAtual(a.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tocando]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function buscar(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duracao || !isFinite(duracao)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duracao;
    setAtual(a.currentTime);
  }

  const fracao = duracao && isFinite(duracao) ? atual / duracao : 0;

  return (
    <div className="-mx-1 flex min-w-[220px] max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => { setTocando(false); setAtual(0); }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d)) {
            setDuracao(d);
            // Workaround webm/MediaRecorder: duração só fica correta após o "seek ao fim".
            if (e.currentTarget.currentTime > 1e100) e.currentTarget.currentTime = 0;
          }
        }}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          if (a.duration === Infinity || isNaN(a.duration)) a.currentTime = 1e101;
          else setDuracao(a.duration);
        }}
      />
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/avatar/${autorId}`} alt="" className="size-9 rounded-full object-cover" />
        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-current">
          <Mic className="size-2.5 text-background" />
        </span>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={tocando ? "Pausar" : "Reproduzir"}
        className="grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-current/10"
      >
        {tocando ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-px fill-current" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          onClick={buscar}
          className="relative flex h-6 cursor-pointer items-center justify-between"
          role="slider"
          aria-label="Posição do áudio"
          aria-valuenow={Math.round(fracao * 100)}
        >
          {barras.map((alt, i) => {
            const tocou = i / (N_BARRAS - 1) <= fracao;
            return (
              <span
                key={i}
                className={cn("w-[2px] shrink-0 rounded-full", tocou ? "bg-current/90" : "bg-current/30")}
                style={{ height: `${Math.round(alt * 100)}%` }}
              />
            );
          })}
          <span
            className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current shadow-sm"
            style={{ left: `${fracao * 100}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums opacity-60">{fmtTempo(tocando || atual ? atual : duracao)}</span>
      </div>
    </div>
  );
}

/** Galeria de emojis para capa de grupo (padrão quando não há imagem). */
const ICONES_GRUPO = ["📁", "⭐", "🚀", "💼", "🛠️", "📊", "🏗️", "💬", "📌", "🔧", "🎯", "🧩", "📐", "🗂️", "🏆", "⚙️"];

/** Capa do grupo: imagem custom > emoji escolhido > ícone padrão (Users). */
function CapaGrupo({
  c,
  size = 16,
}: {
  c: { id: string; icone?: string | null; imagemCapa?: string | null };
  size?: number;
}) {
  if (c.imagemCapa) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/chat/grupo/${c.id}/capa`}
        alt=""
        className="shrink-0 rounded-sm object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  if (c.icone) {
    return (
      <span className="shrink-0 leading-none" style={{ fontSize: Math.round(size * 0.92) }}>
        {c.icone}
      </span>
    );
  }
  return <Users className="shrink-0 text-muted-foreground" style={{ width: size, height: size }} />;
}

function CanalBtn({
  c, sel, onSelect, indent, mostrarCodigo, isSilenciado, statusAtual, onSilenciar, onMarcarLido,
}: {
  c: CanalListItem;
  sel: string | null;
  onSelect: (id: string) => void;
  indent?: boolean;
  mostrarCodigo?: boolean;
  isSilenciado?: boolean;
  statusAtual?: string;
  onSilenciar?: () => void;
  onMarcarLido?: () => void;
}) {
  return (
    <div className="group relative flex w-full items-stretch border-b">
      <button
        onClick={() => onSelect(c.id)}
        className={cn(
          "flex flex-1 min-w-0 items-center gap-2 p-2.5 text-left text-sm hover:bg-muted/50",
          indent && "pl-7",
          sel === c.id && "bg-muted",
        )}
      >
        {c.tipo === "dm" ? (
          <div className="relative shrink-0">
            <AtSign className="size-4 text-muted-foreground" />
            {c.outroUserId && statusAtual && (
              <StatusDot status={statusAtual} className="absolute -right-0.5 -bottom-0.5 size-1.5" />
            )}
          </div>
        ) : c.tipo === "grupo" ? (
          <CapaGrupo c={c} size={16} />
        ) : c.tipo === "socios" ? (
          <Briefcase className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Hash className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-medium">
              {c.nome}
              {mostrarCodigo && c.projetoCodigo ? (
                <span className="ml-1 font-mono text-xs text-muted-foreground">{formatarCodigo(c.projetoCodigo)}</span>
              ) : null}
              {isSilenciado && (
                <BellOff className="ml-1 inline size-2.5 text-muted-foreground" aria-label="Silenciado" />
              )}
            </span>
            {c.naoLidas > 0 && (
              <span className="ml-1 shrink-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {c.naoLidas}
              </span>
            )}
          </div>
          {c.ultima && (
            <p className="truncate text-xs text-muted-foreground">
              {c.ultima.autor}: {c.ultima.conteudo}
            </p>
          )}
        </div>
      </button>
      {/* Ações de canal no hover */}
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
        {onMarcarLido && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarcarLido(); }}
            title="Marcar tudo como lido"
            className="rounded-sm p-0.5 hover:bg-muted"
          >
            <CheckCheck className="size-3 text-muted-foreground" />
          </button>
        )}
        {onSilenciar && (
          <button
            onClick={(e) => { e.stopPropagation(); onSilenciar(); }}
            title={isSilenciado ? "Desmutar canal" : "Mutar canal"}
            className="rounded-sm p-0.5 hover:bg-muted"
          >
            {isSilenciado
              ? <Bell className="size-3 text-muted-foreground" />
              : <BellOff className="size-3 text-muted-foreground" />
            }
          </button>
        )}
      </div>
    </div>
  );
}

export function ChatView({
  canais: canaisIniciais,
  usuarios,
  meId,
  meRole = "administrativo",
  status: statusInicial,
  somChat = true,
  mostrarRecibos = true,
  alturaClasse = "h-[calc(100svh-9rem)]",
}: {
  canais: CanalListItem[];
  usuarios: Usuario[];
  meId: string;
  meRole?: string;
  status: string;
  somChat?: boolean;
  mostrarRecibos?: boolean;
  alturaClasse?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { setChatAtivo, refetch: refetchBadge } = useChatBadge();

  const [canais, setCanais] = useState(canaisIniciais);
  const [sel, setSel] = useState<string | null>(sp.get("c") ?? canaisIniciais[0]?.id ?? null);

  // Mescla canais que vieram de um router.refresh() (ex.: grupo recém-criado ou
  // sincronização do "Sócios") no estado local, sem perder os updates ao vivo de
  // não-lidas/última mensagem dos canais já presentes. Faz grupos aparecerem sem F5.
  useEffect(() => {
    setCanais((prev) => {
      const existentes = new Set(prev.map((c) => c.id));
      const novos = canaisIniciais.filter((c) => !existentes.has(c.id));
      return novos.length > 0 ? [...prev, ...novos] : prev;
    });
  }, [canaisIniciais]);
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [fixadas, setFixadas] = useState<Fixada[]>([]);
  const [painelFixadasAberto, setPainelFixadasAberto] = useState(false);
  // Membros do canal aberto (para a lista lateral contextual online/offline).
  const [membrosCanalAtual, setMembrosCanalAtual] = useState<
    { id: string; name: string; role: string; chatStatus: string | null }[]
  >([]);
  // C4-3: histórico paginado por cursor
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  // C4-4: busca
  const [buscaTexto, setBuscaTexto] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<ResultadoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [destaqueId, setDestaqueId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [status, setStatus] = useState(statusInicial);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [arquivadosAberto, setArquivadosAberto] = useState(false);
  const [observadosAberto, setObservadosAberto] = useState(false);
  // Lista de membros: 0 = todos · 1 = só online · 2 = oculto (só o título).
  const [membrosNivel, setMembrosNivel] = useState(0);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [emojiAberto, setEmojiAberto] = useState(false);
  // Gravação de áudio (microfone)
  const [gravando, setGravando] = useState(false);
  const [gravSegundos, setGravSegundos] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const gravTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelarGravRef = useRef(false);
  // C2 states
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [deletandoId, setDeletandoId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [respondendoA, setRespondendoA] = useState<Msg | null>(null);
  const [encaminhandoMsg, setEncaminhandoMsg] = useState<Msg | null>(null);
  // C3 states
  const [statusUsuarios, setStatusUsuarios] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const u of usuarios) m.set(u.id, u.chatStatus);
    return m;
  });
  const [silenciados, setSilenciados] = useState<Set<string>>(
    () => new Set(canaisIniciais.filter((c) => c.silenciado).map((c) => c.id)),
  );
  // C5-1: quem está digitando no canal atual (userId → nome)
  const [digitandoUsuarios, setDigitandoUsuarios] = useState<Map<string, string>>(new Map());
  // C5-2: grupos ad-hoc
  const [criarGrupoAberto, setCriarGrupoAberto] = useState(false);
  const [gerenciarGrupoId, setGerenciarGrupoId] = useState<string | null>(null);
  // C5-5: índice do item focado no popup de menção (-1 = nenhum)
  const [mencaoIndice, setMencaoIndice] = useState(-1);

  const anexoRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // C4-3: controla o efeito de scroll — "fim" rola ao fundo; "preservar" mantém a posição
  // ao pré-carregar histórico antigo (sem pulo).
  const acaoScrollRef = useRef<"fim" | "preservar">("fim");
  const alturaAntesRef = useRef<number | null>(null);
  // C4-4: ao abrir um resultado de busca, rola até a mensagem-alvo quando ela estiver carregada.
  const scrollAlvoRef = useRef<string | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  const statusRef = useRef(status);
  statusRef.current = status;
  const silenciadosRef = useRef(silenciados);
  silenciadosRef.current = silenciados;
  // C4-2: debounce de marcarLido para mensagens ao vivo no canal aberto (agrupa rajadas).
  const marcarLidoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendenteLidoRef = useRef<string | null>(null);
  // C5-1: throttle do emit "eu estou digitando" + auto-expire dos indicadores recebidos
  const digitandoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const estaDigitandoRef = useRef(false);
  const digitandoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const podeModerarMsg = (msg: Msg) =>
    msg.autor.id === meId || ["admin", "supervisor"].includes(meRole);

  // Sinaliza ao provider global que o chat está visível (evita som/toast duplicado).
  useEffect(() => {
    setChatAtivo(true);
    return () => setChatAtivo(false);
  }, [setChatAtivo]);

  // C2-5: auto-resize do textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [texto]);

  // Carrega mensagens ao trocar de canal + marca lido.
  useEffect(() => {
    if (!sel) return;
    let vivo = true;
    setEditandoId(null);
    setDeletandoId(null);
    setRespondendoA(null);
    setReactionPickerMsgId(null);
    setPainelFixadasAberto(false);
    // Limpa indicadores de digitando do canal anterior (C5-1)
    setDigitandoUsuarios(new Map());
    for (const t of digitandoTimers.current.values()) clearTimeout(t);
    digitandoTimers.current.clear();
    acaoScrollRef.current = "fim";
    setMembrosCanalAtual([]);
    // Garante que o socket está no room do canal (essencial p/ canais observados
    // por admin, em que não houve join automático na conexão). No-op se já no room.
    getSocket().emit("entrar-canal", sel);
    fetch(`/api/chat/canais/${sel}/mensagens`)
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d.mensagens) {
          acaoScrollRef.current = "fim";
          setMensagens(d.mensagens);
          setFixadas(d.fixadas ?? []);
          setTemMais(!!d.temMais);
          setMembrosCanalAtual(d.membros ?? []);
        }
      });
    void marcarLido({ canalId: sel });
    setCanais((cs) => cs.map((c) => (c.id === sel ? { ...c, naoLidas: 0 } : c)));
    return () => {
      vivo = false;
      // Para de digitar no canal que estamos deixando (C5-1).
      if (estaDigitandoRef.current) {
        estaDigitandoRef.current = false;
        if (digitandoTimerRef.current) { clearTimeout(digitandoTimerRef.current); digitandoTimerRef.current = null; }
        getSocket().emit("digitando", { canalId: sel, digitando: false });
      }
      // Ao trocar de canal (ou desmontar), descarrega um marcarLido pendente do canal que estamos
      // deixando, para o lastReadAt avançar mesmo que a rajada não tenha estabilizado (C4-2).
      if (marcarLidoTimerRef.current) {
        clearTimeout(marcarLidoTimerRef.current);
        marcarLidoTimerRef.current = null;
      }
      const pend = pendenteLidoRef.current;
      pendenteLidoRef.current = null;
      if (pend) void marcarLido({ canalId: pend });
    };
  }, [sel]);

  // Socket: mensagens ao vivo, presença, novos canais, edições, exclusões, reações, fixadas, status.
  useEffect(() => {
    const s = getSocket();

    function onMensagem(p: Msg & { canalId: string }) {
      const silenciado = silenciadosRef.current.has(p.canalId);
      if (p.autor.id !== meId && somChat && statusRef.current !== "reuniao" && !silenciado) tocarSom();
      if (p.canalId === selRef.current) {
        setMensagens((m) => [...m, p]);
        // Debounce: agrupa os recibos de uma rajada num único marcarLido (C4-2).
        pendenteLidoRef.current = p.canalId;
        if (marcarLidoTimerRef.current) clearTimeout(marcarLidoTimerRef.current);
        marcarLidoTimerRef.current = setTimeout(() => {
          marcarLidoTimerRef.current = null;
          pendenteLidoRef.current = null;
          void marcarLido({ canalId: p.canalId });
        }, 1200);
      } else {
        setCanais((cs) =>
          cs.map((c) =>
            c.id === p.canalId
              ? { ...c, naoLidas: c.naoLidas + (p.autor.id !== meId ? 1 : 0), ultima: { conteudo: p.conteudo, autor: p.autor.name, createdAt: new Date(p.createdAt) } }
              : c,
          ),
        );
      }
    }
    function onPresenca(p: { userId: string; online: boolean }) {
      setOnline((o) => {
        const n = new Set(o);
        if (p.online) n.add(p.userId);
        else n.delete(p.userId);
        return n;
      });
    }
    function onPresencaInicial(ids: string[]) { setOnline(new Set(ids)); }
    function onLeitura(p: { canalId: string; leitorId: string; leitorNome: string }) {
      if (p.canalId !== selRef.current || p.leitorId === meId) return;
      setMensagens((ms) =>
        ms.map((m) =>
          m.autor.id === meId && !(m.leituras ?? []).some((l) => l.userId === p.leitorId)
            ? { ...m, leituras: [...(m.leituras ?? []), { userId: p.leitorId, user: { name: p.leitorNome } }] }
            : m,
        ),
      );
    }
    function onNovoCanal(p: { canalId: string }) {
      s.emit("entrar-canal", p.canalId);
      router.refresh();
    }
    function onMensagemEditada(p: { id: string; canalId: string; conteudo: string; editedAt: string }) {
      if (p.canalId !== selRef.current) return;
      setMensagens((ms) =>
        ms.map((m) => (m.id === p.id ? { ...m, conteudo: p.conteudo, editedAt: p.editedAt } : m)),
      );
    }
    function onMensagemExcluida(p: { id: string; canalId: string }) {
      if (p.canalId !== selRef.current) return;
      setMensagens((ms) =>
        ms.map((m) => (m.id === p.id ? { ...m, excluidaEm: new Date().toISOString() } : m)),
      );
      setFixadas((fs) => fs.filter((f) => f.id !== p.id));
    }
    function onReacao(p: { mensagemId: string; reacoes: ReacaoAgregada[] }) {
      setMensagens((ms) =>
        ms.map((m) => (m.id === p.mensagemId ? { ...m, reacoes: p.reacoes } : m)),
      );
    }
    function onFixada(p: { mensagemId: string; canalId: string; fixada: boolean; conteudo: string; autorNome: string }) {
      setMensagens((ms) =>
        ms.map((m) => (m.id === p.mensagemId ? { ...m, fixada: p.fixada } : m)),
      );
      if (p.fixada) {
        setFixadas((fs) => [{ id: p.mensagemId, conteudo: p.conteudo, autor: { name: p.autorNome } }, ...fs.filter((f) => f.id !== p.mensagemId)]);
      } else {
        setFixadas((fs) => fs.filter((f) => f.id !== p.mensagemId));
      }
    }
    // C3-1: atualiza status de outros usuários em tempo real
    function onStatusChat(p: { userId: string; status: string }) {
      setStatusUsuarios((m) => {
        const n = new Map(m);
        n.set(p.userId, p.status);
        return n;
      });
    }
    // C5-2: remove o canal da lista quando o próprio usuário sai do grupo
    function onSairCanal(p: { canalId: string }) {
      setCanais((cs) => cs.filter((c) => c.id !== p.canalId));
      if (selRef.current === p.canalId) setSel(null);
      setGerenciarGrupoId((id) => (id === p.canalId ? null : id));
    }
    // C5-2: atualiza o nome do grupo ao vivo
    function onGrupoRenomeado(p: { canalId: string; nome: string }) {
      setCanais((cs) => cs.map((c) => (c.id === p.canalId ? { ...c, nome: p.nome } : c)));
    }
    // Capa do grupo (ícone/imagem) atualizada ao vivo.
    function onGrupoAtualizado(p: { canalId: string; icone: string | null; imagemCapa: string | null }) {
      setCanais((cs) =>
        cs.map((c) => (c.id === p.canalId ? { ...c, icone: p.icone, imagemCapa: p.imagemCapa } : c)),
      );
    }
    // C5-1: exibe/oculta indicador "está digitando…"
    function onDigitando(p: { canalId: string; userId: string; nome: string; digitando: boolean }) {
      if (p.canalId !== selRef.current || p.userId === meId) return;
      const existing = digitandoTimers.current.get(p.userId);
      if (existing) clearTimeout(existing);
      if (p.digitando) {
        setDigitandoUsuarios((m) => { const n = new Map(m); n.set(p.userId, p.nome); return n; });
        const t = setTimeout(() => {
          setDigitandoUsuarios((m) => { const n = new Map(m); n.delete(p.userId); return n; });
          digitandoTimers.current.delete(p.userId);
        }, 5000);
        digitandoTimers.current.set(p.userId, t);
      } else {
        setDigitandoUsuarios((m) => { const n = new Map(m); n.delete(p.userId); return n; });
        digitandoTimers.current.delete(p.userId);
      }
    }

    s.on("mensagem", onMensagem);
    s.on("presenca", onPresenca);
    s.on("presenca-inicial", onPresencaInicial);
    s.on("entrar-canal-novo", onNovoCanal);
    // Pede o snapshot atual de online (cobre o caso de já estar conectado ao montar).
    s.emit("solicitar-presenca");
    s.on("leitura", onLeitura);
    s.on("mensagem-editada", onMensagemEditada);
    s.on("mensagem-excluida", onMensagemExcluida);
    s.on("reacao", onReacao);
    s.on("fixada", onFixada);
    s.on("status-chat", onStatusChat);
    s.on("digitando", onDigitando);
    s.on("sair-canal", onSairCanal);
    s.on("grupo-renomeado", onGrupoRenomeado);
    s.on("grupo-atualizado", onGrupoAtualizado);
    return () => {
      s.off("mensagem", onMensagem);
      s.off("presenca", onPresenca);
      s.off("presenca-inicial", onPresencaInicial);
      s.off("entrar-canal-novo", onNovoCanal);
      s.off("leitura", onLeitura);
      s.off("mensagem-editada", onMensagemEditada);
      s.off("mensagem-excluida", onMensagemExcluida);
      s.off("reacao", onReacao);
      s.off("fixada", onFixada);
      s.off("status-chat", onStatusChat);
      s.off("digitando", onDigitando);
      s.off("sair-canal", onSairCanal);
      s.off("grupo-renomeado", onGrupoRenomeado);
      s.off("grupo-atualizado", onGrupoAtualizado);
    };
  }, [meId, router, somChat]);

  useLayoutEffect(() => {
    // Ao pré-carregar histórico antigo, restaura a posição: compensa o crescimento do conteúdo
    // acima da viewport para o usuário não "pular" (C4-3). Demais mudanças rolam ao fim.
    const cont = listaRef.current;
    if (acaoScrollRef.current === "preservar" && cont && alturaAntesRef.current != null) {
      cont.scrollTop += cont.scrollHeight - alturaAntesRef.current;
      alturaAntesRef.current = null;
      acaoScrollRef.current = "fim";
      return;
    }
    // C4-4: veio de um resultado de busca — rola até a mensagem-alvo se ela estiver na janela.
    if (scrollAlvoRef.current) {
      const alvo = scrollAlvoRef.current;
      const el = document.getElementById(`msg-${alvo}`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        scrollAlvoRef.current = null;
        setDestaqueId(alvo);
        setTimeout(() => setDestaqueId((d) => (d === alvo ? null : d)), 2200);
        return;
      }
      scrollAlvoRef.current = null; // fora da janela carregada → cai para o fim
    }
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // C4-4: busca de mensagens (debounce) nos canais do usuário.
  useEffect(() => {
    const t = buscaTexto.trim();
    if (t.length < 2) {
      setResultadosBusca([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const id = setTimeout(() => {
      fetch(`/api/chat/busca?q=${encodeURIComponent(t)}`)
        .then((r) => (r.ok ? r.json() : { resultados: [] }))
        .then((d) => setResultadosBusca(d.resultados ?? []))
        .catch(() => setResultadosBusca([]))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(id);
  }, [buscaTexto]);

  // C4-3: carrega a página anterior (mensagens mais antigas) ao chegar perto do topo.
  async function carregarMais() {
    const canalAtual = sel;
    if (!canalAtual || !temMais || carregandoMais || mensagens.length === 0) return;
    setCarregandoMais(true);
    alturaAntesRef.current = listaRef.current?.scrollHeight ?? null;
    acaoScrollRef.current = "preservar";
    try {
      const r = await fetch(`/api/chat/canais/${canalAtual}/mensagens?antes=${mensagens[0].id}`);
      const d = await r.json();
      // Se o usuário trocou de canal durante o fetch, descarta para não corromper a lista.
      if (selRef.current !== canalAtual || !d.mensagens) {
        acaoScrollRef.current = "fim";
        return;
      }
      setMensagens((ms) => [...d.mensagens, ...ms]);
      setTemMais(!!d.temMais);
    } catch {
      acaoScrollRef.current = "fim";
    } finally {
      setCarregandoMais(false);
    }
  }

  function onScrollLista(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < 80) void carregarMais();
  }

  function scrollToMensagem(id: string) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const canalNomePorId = (id: string) => canais.find((c) => c.id === id)?.nome ?? "Conversa";

  // C4-4: abre o canal de um resultado e marca a mensagem-alvo para rolar quando carregar.
  function abrirResultado(canalId: string, mensagemId: string) {
    scrollAlvoRef.current = mensagemId;
    setBuscaTexto("");
    setResultadosBusca([]);
    if (sel === canalId) scrollToMensagem(mensagemId);
    else setSel(canalId);
  }

  // Faz upload de um arquivo e envia como mensagem (sem texto) no canal aberto.
  async function enviarAnexoDireto(arquivo: File) {
    const canalId = selRef.current;
    if (!canalId) return;
    setEnviandoAnexo(true);
    try {
      const fd = new FormData();
      fd.append("canalId", canalId);
      fd.append("file", arquivo);
      const res = await fetch("/api/chat/anexo", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error ?? "Falha ao enviar o áudio."); return; }
      const r = await enviarMensagem({ canalId, conteudo: "", anexoPath: j.anexoPath, anexoNome: j.anexoNome, anexoMime: j.anexoMime });
      if (!r.ok) toast.error(r.error);
    } finally {
      setEnviandoAnexo(false);
    }
  }

  // Gravação de áudio pelo microfone (MediaRecorder). Ao concluir (ou bater o limite
  // de tempo/tamanho), o áudio é ENVIADO automaticamente. Cancelar descarta.
  const LIMITE_AUDIO = 14 * 1024 * 1024; // margem sob o teto de 15 MB do upload
  async function iniciarGravacao() {
    if (gravando) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      cancelarGravRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          const total = audioChunksRef.current.reduce((s, b) => s + b.size, 0);
          if (total >= LIMITE_AUDIO && mr.state === "recording") mr.stop(); // limite de tamanho
        }
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (gravTimerRef.current) { clearInterval(gravTimerRef.current); gravTimerRef.current = null; }
        setGravando(false);
        setGravSegundos(0);
        if (cancelarGravRef.current) return;
        const tipo = mr.mimeType || "audio/webm";
        const ext = tipo.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: tipo });
        void enviarAnexoDireto(new File([blob], `audio-${Date.now()}.${ext}`, { type: tipo }));
      };
      mediaRecorderRef.current = mr;
      mr.start(1000); // timeslice de 1s → mede o tamanho acumulado durante a gravação
      setGravando(true);
      setGravSegundos(0);
      gravTimerRef.current = setInterval(() => {
        setGravSegundos((s) => {
          if (s + 1 >= 300) { mediaRecorderRef.current?.stop(); return 300; } // auto-stop 5 min
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  }
  function pararGravacao() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }
  function cancelarGravacao() {
    cancelarGravRef.current = true;
    pararGravacao();
  }

  async function enviar() {
    if (!sel || enviandoAnexo) return;
    if (!texto.trim() && !anexo) return;
    const conteudo = texto;
    const arquivo = anexo;
    const replyId = respondendoA?.id;
    setTexto("");
    setAnexo(null);
    setRespondendoA(null);
    // Para de digitar ao enviar (C5-1)
    if (estaDigitandoRef.current) {
      estaDigitandoRef.current = false;
      if (digitandoTimerRef.current) { clearTimeout(digitandoTimerRef.current); digitandoTimerRef.current = null; }
      getSocket().emit("digitando", { canalId: sel, digitando: false });
    }

    let meta: { anexoPath: string; anexoNome: string; anexoMime: string } | undefined;
    if (arquivo) {
      setEnviandoAnexo(true);
      try {
        const fd = new FormData();
        fd.append("canalId", sel);
        fd.append("file", arquivo);
        const res = await fetch("/api/chat/anexo", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j.error ?? "Falha ao enviar o anexo.");
          setEnviandoAnexo(false);
          return;
        }
        meta = j;
      } finally {
        setEnviandoAnexo(false);
      }
    }

    const r = await enviarMensagem({ canalId: sel, conteudo, respostaAId: replyId, ...meta });
    if (!r.ok) toast.error(r.error);
  }

  async function salvarEdicao(msgId: string) {
    if (!editTexto.trim()) return;
    const r = await editarMensagem({ mensagemId: msgId, conteudo: editTexto });
    if (r.ok) setEditandoId(null);
    else toast.error(r.error);
  }

  async function confirmarExclusao(msgId: string) {
    const r = await excluirMensagem({ mensagemId: msgId });
    if (!r.ok) toast.error(r.error);
    setDeletandoId(null);
  }

  async function toggleReacao(msgId: string, emoji: string) {
    setReactionPickerMsgId(null);
    const r = await reagir({ mensagemId: msgId, emoji });
    if (!r.ok) toast.error(r.error);
  }

  async function toggleFixar(msg: Msg) {
    const r = await fixarMensagem({ mensagemId: msg.id, fixar: !msg.fixada });
    if (!r.ok) toast.error(r.error);
  }

  async function handleEncaminhar(canalIdDestino: string) {
    if (!encaminhandoMsg) return;
    const r = await encaminharMensagem({ mensagemId: encaminhandoMsg.id, canalId: canalIdDestino });
    if (!r.ok) { toast.error(r.error); return; }
    setEncaminhandoMsg(null);
    toast.success("Mensagem encaminhada.");
    setSel(canalIdDestino);
  }

  // C3-5: silenciar/desmutar canal
  async function toggleSilenciar(canalId: string) {
    const novoEstado = !silenciados.has(canalId);
    setSilenciados((s) => {
      const n = new Set(s);
      if (novoEstado) n.add(canalId);
      else n.delete(canalId);
      return n;
    });
    const r = await silenciarCanal({ canalId, silenciar: novoEstado });
    if (!r.ok) {
      setSilenciados((s) => {
        const n = new Set(s);
        if (!novoEstado) n.add(canalId);
        else n.delete(canalId);
        return n;
      });
      toast.error(r.error);
    } else {
      refetchBadge();
    }
  }

  // C3-5: marcar todo o canal como lido
  async function marcarTudoLidoCanal(canalId: string) {
    const r = await marcarTudoLido({ canalId });
    if (!r.ok) toast.error(r.error);
    else setCanais((cs) => cs.map((c) => (c.id === canalId ? { ...c, naoLidas: 0 } : c)));
  }

  function mudarStatus(s: string) {
    setStatus(s);
    void definirStatusChat({ status: s as ChatStatus });
  }

  async function novaDM(usuarioId: string) {
    const r = await abrirDM({ usuarioId });
    if (r.ok) {
      router.refresh();
      setSel(r.data.canalId);
    } else toast.error(r.error);
  }

  // C5-2: handlers de grupo ad-hoc
  async function handleCriarGrupo(nome: string, membroIds: string[]) {
    const r = await criarGrupo({ nome, membroIds });
    if (r.ok) {
      setCriarGrupoAberto(false);
      router.refresh();
      setSel(r.data.canalId);
    } else toast.error(r.error);
  }
  async function handleAdicionarMembro(canalId: string, usuarioId: string) {
    const r = await adicionarMembroGrupo({ canalId, usuarioId });
    if (!r.ok) toast.error(r.error);
    else router.refresh();
  }
  async function handleRemoverMembro(canalId: string, usuarioId: string) {
    const r = await removerMembroGrupo({ canalId, usuarioId });
    if (!r.ok) toast.error(r.error);
    else if (usuarioId === meId) setGerenciarGrupoId(null);
    else router.refresh();
  }
  async function handleRenomearGrupo(canalId: string, nome: string) {
    const r = await renomearGrupo({ canalId, nome });
    if (!r.ok) toast.error(r.error);
  }
  // Capa: define um emoji da galeria (limpa a imagem). Atualiza local na hora.
  async function handleDefinirIcone(canalId: string, icone: string | null) {
    setCanais((cs) => cs.map((c) => (c.id === canalId ? { ...c, icone, imagemCapa: null } : c)));
    const r = await definirIconeGrupo({ canalId, icone });
    if (!r.ok) toast.error(r.error);
  }
  // Capa: faz upload de uma imagem custom (multipart). Atualiza local na hora.
  async function handleUploadCapa(canalId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/chat/grupo/${canalId}/capa`, { method: "POST", body: fd });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      toast.error(d?.error ?? "Falha ao enviar a imagem.");
      return;
    }
    const d = await res.json();
    setCanais((cs) => cs.map((c) => (c.id === canalId ? { ...c, imagemCapa: d.imagemCapa, icone: null } : c)));
  }

  const canalSel = canais.find((c) => c.id === sel);
  const mencaoMatch = texto.match(REGEX_MENCAO_CURSOR);
  const mencaoOpcoes: Usuario[] = mencaoMatch
    ? (() => {
        const q = mencaoMatch[2].toLowerCase();
        const users = usuarios.filter((u) => u.id !== meId && u.name.toLowerCase().includes(q));
        // Sugere @todos (notifica todos do canal) quando a query casa "todos"/"all".
        const sugereTodos = q.length > 0 && ("todos".startsWith(q) || "all".startsWith(q));
        const base: Usuario[] = sugereTodos
          ? [{ id: "__todos__", name: "todos", role: "", chatStatus: "disponivel" }, ...users]
          : users;
        return base.slice(0, 6);
      })()
    : [];

  function inserirMencao(nome: string) {
    setTexto((t) => inserirMencaoNoTexto(t, nome));
    textareaRef.current?.focus();
  }

  function toggleProjeto(pid: string) {
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  }

  const gerais = canais.filter((c) => c.tipo === "geral" && !c.observador);
  const socios = canais.filter((c) => c.tipo === "socios" && !c.observador);
  const grupos = canais.filter((c) => c.tipo === "grupo" && !c.observador);
  const dms = canais.filter((c) => c.tipo === "dm" && !c.observador);
  // Admin/supervisor: canais que observa (não participa) — somente leitura.
  const observados = canais.filter((c) => c.observador);

  // C5-5: reseta o índice de menção quando as opções mudam de quantidade
  useEffect(() => { setMencaoIndice(-1); }, [mencaoOpcoes.length]);

  // C4-4: em modo busca, a sidebar mostra canais filtrados (cliente) + resultados de mensagens (servidor).
  const buscaAtiva = buscaTexto.trim().length > 0;
  const termoBusca = buscaTexto.trim().toLowerCase();
  const canaisFiltrados = buscaAtiva
    ? canais.filter(
        (c) =>
          c.nome.toLowerCase().includes(termoBusca) ||
          (c.projetoCodigo && formatarCodigo(c.projetoCodigo).toLowerCase().includes(termoBusca)),
      )
    : [];

  type ProjetoGrupo = { codigo: string | null; principal: CanalListItem | null; subs: CanalListItem[]; naoLidas: number };
  const projetosAtivos = new Map<string, ProjetoGrupo>();
  const projetosArquivados = new Map<string, ProjetoGrupo>();

  for (const c of canais) {
    if (c.tipo !== "projeto" && c.tipo !== "disciplina") continue;
    const pid = c.projetoId ?? c.id;
    const isArq = c.projetoSituacao ? SITUACOES_ARQUIVADAS.has(c.projetoSituacao) : false;
    const mapa = isArq ? projetosArquivados : projetosAtivos;
    const g = mapa.get(pid) ?? { codigo: c.projetoCodigo, principal: null, subs: [], naoLidas: 0 };
    if (c.tipo === "projeto") g.principal = c;
    else g.subs.push(c);
    if (!g.codigo) g.codigo = c.projetoCodigo;
    g.naoLidas += c.naoLidas;
    mapa.set(pid, g);
  }

  // Expandir/recolher todos os grupos de projeto (e seções colapsáveis).
  const idsProjetos = [...projetosAtivos.keys(), ...projetosArquivados.keys()];
  const tudoRecolhido =
    idsProjetos.length > 0 &&
    idsProjetos.every((id) => recolhidos.has(id)) &&
    !arquivadosAberto &&
    (observados.length === 0 || !observadosAberto);
  function alternarTudo() {
    if (tudoRecolhido) {
      setRecolhidos(new Set());
      setArquivadosAberto(true);
      setObservadosAberto(true);
    } else {
      setRecolhidos(new Set(idsProjetos));
      setArquivadosAberto(false);
      setObservadosAberto(false);
    }
  }

  // Membros do canal aberto, online primeiro (depois alfabético) — lista lateral contextual.
  const membrosOrdenados = [...membrosCanalAtual].sort((a, b) => {
    const ao = online.has(a.id) ? 0 : 1;
    const bo = online.has(b.id) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
  const qtdOnline = membrosOrdenados.filter((u) => online.has(u.id)).length;

  function renderProjetoGrupo(pid: string, g: ProjetoGrupo) {
    const recolhido = recolhidos.has(pid);
    return (
      <div key={pid}>
        <div className="flex items-center border-b bg-muted/30">
          <button
            onClick={() => toggleProjeto(pid)}
            className="px-1.5 py-2 text-muted-foreground hover:text-foreground"
            aria-label={recolhido ? "Expandir" : "Recolher"}
          >
            <ChevronDown className={cn("size-4 transition-transform", recolhido && "-rotate-90")} />
          </button>
          <button
            onClick={() => g.principal && setSel(g.principal.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-2 text-left text-sm hover:bg-muted/50"
          >
            <Hash className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-semibold">
              {g.codigo ? formatarCodigo(g.codigo) : g.principal?.nome ?? "Projeto"}
            </span>
            {g.principal?.nome && g.codigo && (
              <span className="truncate text-xs text-muted-foreground">· {g.principal.nome}</span>
            )}
            {g.naoLidas > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {g.naoLidas}
              </span>
            )}
          </button>
        </div>
        {!recolhido && g.subs.map((c) => (
          <CanalBtn
            key={c.id}
            c={c}
            sel={sel}
            onSelect={setSel}
            indent
            isSilenciado={silenciados.has(c.id)}
            onSilenciar={() => toggleSilenciar(c.id)}
            onMarcarLido={() => marcarTudoLidoCanal(c.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid ${alturaClasse} grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]`}>
      {/* Lista de canais */}
      <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-sm border", sel && "hidden lg:flex")}>
        <div className="flex items-center justify-between gap-2 border-b p-2">
          <Select value={status} onValueChange={(v) => mudarStatus(v ?? "disponivel")}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  <Circle className={cn("mr-1 inline size-2", STATUS_COR[k])} /> {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DMDialog usuarios={usuarios} online={online} statusUsuarios={statusUsuarios} onAbrir={novaDM} />
          {/* C5-2: diálogos de grupo */}
          <CriarGrupoDialog
            open={criarGrupoAberto}
            onClose={() => setCriarGrupoAberto(false)}
            usuarios={usuarios}
            onCriar={handleCriarGrupo}
          />
          {encaminhandoMsg && (
            <EncaminharDialog
              canais={canais.filter((c) => !c.observador)}
              onClose={() => setEncaminhandoMsg(null)}
              onEscolher={handleEncaminhar}
            />
          )}
          {gerenciarGrupoId && (() => {
            const g = canais.find((c) => c.id === gerenciarGrupoId);
            if (!g) return null;
            return (
              <GerenciarGrupoDialog
                canal={g}
                meId={meId}
                meRole={meRole}
                usuarios={usuarios}
                onClose={() => setGerenciarGrupoId(null)}
                onRenomear={(nome) => handleRenomearGrupo(g.id, nome)}
                onAdicionarMembro={(uid) => handleAdicionarMembro(g.id, uid)}
                onRemoverMembro={(uid) => handleRemoverMembro(g.id, uid)}
                onDefinirIcone={(icone) => handleDefinirIcone(g.id, icone)}
                onUploadCapa={(file) => handleUploadCapa(g.id, file)}
              />
            );
          })()}
        </div>
        {/* C4-4: busca + expandir/recolher tudo */}
        <div className="flex items-center gap-1 border-b p-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              placeholder="Buscar conversas e mensagens…"
              className="w-full rounded-sm border border-input bg-background py-1.5 pl-7 pr-7 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {buscaTexto && (
              <button
                type="button"
                onClick={() => setBuscaTexto("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="size-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={alternarTudo}
            title={tudoRecolhido ? "Expandir todos os canais" : "Recolher todos os canais"}
            aria-label={tudoRecolhido ? "Expandir todos os canais" : "Recolher todos os canais"}
            className="shrink-0 rounded-sm border border-input p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {tudoRecolhido ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {buscaAtiva ? (
            <>
              {canaisFiltrados.length > 0 && (
                <>
                  <p className="border-b px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Conversas
                  </p>
                  {canaisFiltrados.map((c) => (
                    <CanalBtn
                      key={c.id}
                      c={c}
                      sel={sel}
                      onSelect={(id) => { setSel(id); setBuscaTexto(""); }}
                      mostrarCodigo
                      isSilenciado={silenciados.has(c.id)}
                    />
                  ))}
                </>
              )}
              <p className="flex items-center gap-1 border-b px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mensagens
                {buscando && <span className="normal-case opacity-70">· buscando…</span>}
              </p>
              {!buscando && resultadosBusca.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">Nenhuma mensagem encontrada.</p>
              )}
              {resultadosBusca.map((r) => (
                <button
                  key={r.id}
                  onClick={() => abrirResultado(r.canalId, r.id)}
                  className="flex w-full flex-col items-start gap-0.5 border-b p-2.5 text-left hover:bg-muted/50"
                >
                  <span className="flex w-full items-center gap-1 text-xs">
                    <span className="font-medium">{r.autorNome}</span>
                    <span className="truncate text-muted-foreground">· {canalNomePorId(r.canalId)}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{r.conteudo}</span>
                </button>
              ))}
            </>
          ) : (
            <>
          {gerais.map((c) => (
            <CanalBtn
              key={c.id}
              c={c}
              sel={sel}
              onSelect={setSel}
              isSilenciado={silenciados.has(c.id)}
              onSilenciar={() => toggleSilenciar(c.id)}
              onMarcarLido={() => marcarTudoLidoCanal(c.id)}
            />
          ))}

          {/* Grupo de sistema "Sócios" (sincronizado automaticamente). */}
          {socios.map((c) => (
            <CanalBtn
              key={c.id}
              c={c}
              sel={sel}
              onSelect={setSel}
              isSilenciado={silenciados.has(c.id)}
              onSilenciar={() => toggleSilenciar(c.id)}
              onMarcarLido={() => marcarTudoLidoCanal(c.id)}
            />
          ))}

          {[...projetosAtivos.entries()].map(([pid, g]) => renderProjetoGrupo(pid, g))}

          {/* C3-4: Arquivados */}
          {projetosArquivados.size > 0 && (
            <div>
              <button
                onClick={() => setArquivadosAberto((v) => !v)}
                className="flex w-full items-center gap-1.5 border-b bg-muted/20 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", !arquivadosAberto && "-rotate-90")} />
                Arquivados ({projetosArquivados.size})
              </button>
              {arquivadosAberto && [...projetosArquivados.entries()].map(([pid, g]) => renderProjetoGrupo(pid, g))}
            </div>
          )}

          {/* C5-2: canais de grupo ad-hoc */}
          <div className="flex items-center justify-between border-b bg-muted/10 px-2.5 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Grupos
            </p>
            <button
              onClick={() => setCriarGrupoAberto(true)}
              title="Criar grupo"
              className="rounded-sm p-0.5 hover:bg-muted"
            >
              <Plus className="size-3 text-muted-foreground" />
            </button>
          </div>
          {grupos.map((c) => (
            <CanalBtn
              key={c.id}
              c={c}
              sel={sel}
              onSelect={setSel}
              isSilenciado={silenciados.has(c.id)}
              onSilenciar={() => toggleSilenciar(c.id)}
              onMarcarLido={() => marcarTudoLidoCanal(c.id)}
            />
          ))}

          {dms.length > 0 && (
            <p className="border-b px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mensagens diretas
            </p>
          )}
          {dms.map((c) => (
            <CanalBtn
              key={c.id}
              c={c}
              sel={sel}
              onSelect={setSel}
              isSilenciado={silenciados.has(c.id)}
              statusAtual={c.outroUserId ? (statusUsuarios.get(c.outroUserId) ?? c.outroUserStatus ?? undefined) : undefined}
              onSilenciar={() => toggleSilenciar(c.id)}
              onMarcarLido={() => marcarTudoLidoCanal(c.id)}
            />
          ))}

          {/* Admin/supervisor: canais observados (somente leitura) */}
          {observados.length > 0 && (
            <div>
              <button
                onClick={() => setObservadosAberto((v) => !v)}
                className="flex w-full items-center gap-1.5 border-b bg-muted/20 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", !observadosAberto && "-rotate-90")} />
                <Eye className="size-3.5" />
                Moderação · todos os canais ({observados.length})
              </button>
              {observadosAberto && observados.map((c) => (
                <CanalBtn key={c.id} c={c} sel={sel} onSelect={setSel} isSilenciado={false} />
              ))}
            </div>
          )}
            </>
          )}
        </div>

        {/* Membros do canal aberto — clique no título minimiza em 2 níveis */}
        <div className="border-t p-2">
          <button
            onClick={() => canalSel && setMembrosNivel((n) => (n + 1) % 3)}
            disabled={!canalSel}
            title={
              membrosNivel === 0 ? "Ocultar offline"
                : membrosNivel === 1 ? "Ocultar todos"
                : "Mostrar membros"
            }
            className="mb-1 flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
          >
            {canalSel && (
              <ChevronDown className={cn("size-3 transition-transform", membrosNivel === 2 && "-rotate-90")} />
            )}
            {canalSel ? `Membros · ${qtdOnline}/${membrosOrdenados.length} online` : "Membros"}
          </button>
          {!canalSel ? (
            <p className="text-xs text-muted-foreground">Selecione um canal.</p>
          ) : membrosOrdenados.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem membros.</p>
          ) : membrosNivel === 2 ? null : (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {membrosOrdenados
                .filter((u) => membrosNivel === 0 || online.has(u.id))
                .map((u) => {
                  const isOnline = online.has(u.id);
                  const st = statusUsuarios.get(u.id) ?? u.chatStatus ?? "disponivel";
                  return (
                    <li key={u.id} className={cn("flex items-center gap-1.5 text-xs", !isOnline && "opacity-50")}>
                      {isOnline
                        ? <StatusDot status={st} />
                        : <Circle className="size-2 shrink-0 text-muted-foreground/40" />}
                      <span className="truncate">{u.name}</span>
                    </li>
                  );
                })}
              {membrosNivel === 1 && qtdOnline === 0 && (
                <li className="text-xs text-muted-foreground">Ninguém online.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Conversa */}
      <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-sm border", !sel && "hidden lg:flex")}>
        {canalSel ? (
          <>
            {/* Header do canal */}
            <div className="flex items-center gap-2 border-b p-3">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSel(null)}>
                ←
              </Button>
              {canalSel.tipo === "dm" ? <AtSign className="size-4" /> : canalSel.tipo === "grupo" ? <CapaGrupo c={canalSel} size={20} /> : canalSel.tipo === "socios" ? <Briefcase className="size-4" /> : <Hash className="size-4" />}
              <span className="font-semibold">{canalSel.nome}</span>
              {/* C5-2: gerenciar grupo */}
              {canalSel.tipo === "grupo" && (
                <button
                  onClick={() => setGerenciarGrupoId(canalSel.id)}
                  title="Gerenciar grupo"
                  className="ml-auto p-1 text-muted-foreground hover:text-foreground"
                >
                  <Settings2 className="size-4" />
                </button>
              )}
              {/* C3-3: link para o projeto */}
              {canalSel.projetoId && (
                <Link
                  href={`/projetos/${canalSel.projetoId}`}
                  className={canalSel.tipo === "grupo" ? "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" : "ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"}
                  title="Abrir projeto"
                >
                  <ExternalLink className="size-3" />
                  Projeto
                </Link>
              )}
            </div>

            {/* C2-3: painel de mensagens fixadas */}
            {fixadas.length > 0 && (
              <div className="border-b bg-muted/20 px-3 py-1.5 text-sm">
                <button
                  onClick={() => setPainelFixadasAberto((v) => !v)}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Pin className="size-3.5" />
                  <span className="font-medium">{fixadas.length} fixada(s)</span>
                  <ChevronDown className={cn("size-3.5 transition-transform", !painelFixadasAberto && "-rotate-90")} />
                </button>
                {painelFixadasAberto && (
                  <div className="mt-1.5 space-y-1">
                    {fixadas.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => scrollToMensagem(f.id)}
                        className="flex w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs hover:bg-muted/60"
                      >
                        <Pin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="font-semibold">{f.autor.name}:</span>{" "}
                          <span className="text-muted-foreground line-clamp-1">{f.conteudo.slice(0, 80)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lista de mensagens */}
            <div ref={listaRef} onScroll={onScrollLista} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3" aria-live="polite" aria-relevant="additions" aria-label="Mensagens">
              {carregandoMais && (
                <p className="py-1 text-center text-xs text-muted-foreground">Carregando histórico…</p>
              )}
              {!temMais && !carregandoMais && mensagens.length > 0 && (
                <p className="py-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  Início da conversa
                </p>
              )}
              {mensagens.map((m) => {
                const meu = m.autor.id === meId;
                const excluida = !!m.excluidaEm;
                const editando = editandoId === m.id;
                const deletando = deletandoId === m.id;
                const podeAgir = podeModerarMsg(m);

                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={cn(
                      "group flex rounded-md transition-colors",
                      meu ? "justify-end" : "justify-start",
                      destaqueId === m.id && "bg-primary/10 ring-1 ring-primary/30",
                    )}
                  >
                    <div className="relative max-w-[75%]">
                    {/* Barra de ações (hover) — flutua ancorada ao balão */}
                    {!excluida && !editando && (
                      <div className={cn(
                        "absolute -bottom-3 z-10 flex items-center gap-0.5 rounded-md border bg-popover px-0.5 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
                        meu ? "left-1" : "right-1",
                      )}>
                        <button
                          title="Responder"
                          onClick={() => setRespondendoA(m)}
                          className="rounded-sm p-1 hover:bg-muted"
                        >
                          <Reply className="size-3.5 text-muted-foreground" />
                        </button>
                        <button
                          title="Encaminhar"
                          onClick={() => setEncaminhandoMsg(m)}
                          className="rounded-sm p-1 hover:bg-muted"
                        >
                          <Forward className="size-3.5 text-muted-foreground" />
                        </button>
                        <div className="relative">
                          <button
                            title="Reagir"
                            onClick={() => setReactionPickerMsgId((id) => id === m.id ? null : m.id)}
                            className="rounded-sm p-1 hover:bg-muted"
                          >
                            <Smile className="size-3.5 text-muted-foreground" />
                          </button>
                          {reactionPickerMsgId === m.id && (
                            <div className={cn(
                              "absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-sm border bg-popover p-1 shadow-md",
                              meu ? "right-0" : "left-0",
                            )}>
                              {EMOJIS_REACAO.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => toggleReacao(m.id, e)}
                                  className="rounded-sm p-0.5 text-base hover:bg-muted"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          title={m.fixada ? "Desafixar" : "Fixar"}
                          onClick={() => toggleFixar(m)}
                          className="rounded-sm p-1 hover:bg-muted"
                        >
                          {m.fixada
                            ? <PinOff className="size-3.5 text-muted-foreground" />
                            : <Pin className="size-3.5 text-muted-foreground" />
                          }
                        </button>
                        {podeAgir && (
                          <>
                            <button
                              title="Editar"
                              onClick={() => { setEditandoId(m.id); setEditTexto(m.conteudo); }}
                              className="rounded-sm p-1 hover:bg-muted"
                            >
                              <Pencil className="size-3.5 text-muted-foreground" />
                            </button>
                            <button
                              title="Excluir"
                              onClick={() => setDeletandoId(m.id)}
                              className="rounded-sm p-1 hover:bg-muted"
                            >
                              <Trash2 className="size-3.5 text-muted-foreground" />
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Balão da mensagem */}
                    <div className={cn(
                      "rounded-md px-3 py-1.5 text-sm",
                      meu ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}>
                      {!meu && <p className="text-xs font-semibold opacity-80">{m.autor.name}</p>}

                      {m.encaminhada && !m.excluidaEm && (
                        <p className="mb-0.5 flex items-center gap-1 text-[11px] italic opacity-60">
                          <Forward className="size-3" /> Encaminhada
                        </p>
                      )}

                      {m.respostaA && (
                        <button
                          onClick={() => scrollToMensagem(m.respostaA!.id)}
                          className={cn(
                            "mb-1.5 block w-full rounded-sm border-l-2 pl-2 text-left text-xs",
                            meu ? "border-primary-foreground/40 text-primary-foreground/70" : "border-primary/50 text-muted-foreground",
                          )}
                        >
                          <span className="font-semibold">{m.respostaA.autor.name}</span>
                          <p className="line-clamp-1">{m.respostaA.conteudo ?? "[Mensagem removida]"}</p>
                        </button>
                      )}

                      {excluida ? (
                        <p className="italic opacity-50">[Mensagem removida]</p>
                      ) : editando ? (
                        <div className="space-y-1">
                          <textarea
                            value={editTexto}
                            onChange={(e) => setEditTexto(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void salvarEdicao(m.id); }
                              if (e.key === "Escape") setEditandoId(null);
                            }}
                            rows={2}
                            autoFocus
                            className={cn(
                              "w-full resize-none rounded-sm border bg-background/20 px-2 py-1 text-sm outline-none focus:ring-1",
                              meu ? "ring-primary-foreground/40 text-primary-foreground placeholder:text-primary-foreground/50" : "ring-primary",
                            )}
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => void salvarEdicao(m.id)}
                              className="rounded-sm bg-background/20 px-2 py-0.5 text-xs font-medium hover:bg-background/40"
                            >Salvar</button>
                            <button
                              onClick={() => setEditandoId(null)}
                              className="rounded-sm px-2 py-0.5 text-xs opacity-70 hover:opacity-100"
                            >Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.anexoMime && (
                            m.anexoMime.startsWith("image/") ? (
                              <a href={`/api/chat/anexo/${m.id}`} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/chat/anexo/${m.id}`}
                                  alt={m.anexoNome ?? "anexo"}
                                  className="mb-1 max-h-48 rounded-sm border border-current/10 object-cover"
                                />
                              </a>
                            ) : m.anexoMime.startsWith("audio/") ? (
                              <AudioPlayer src={`/api/chat/anexo/${m.id}`} autorId={m.autor.id} />
                            ) : (
                              <a
                                href={`/api/chat/anexo/${m.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-1 flex items-center gap-1.5 rounded-sm bg-background/20 px-2 py-1 text-xs underline-offset-2 hover:underline"
                              >
                                <FileText className="size-3.5 shrink-0" />
                                <span className="truncate">{m.anexoNome ?? "Arquivo"}</span>
                              </a>
                            )
                          )}
                          {m.conteudo && (
                            <p className="whitespace-pre-wrap break-words">{renderConteudo(m.conteudo)}</p>
                          )}
                        </>
                      )}

                      {/* Rodapé: horário + editada + recibos + confirm delete */}
                      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {deletando && !excluida ? (
                            <span className="flex items-center gap-1 text-[10px]">
                              <span className="text-destructive font-medium">Excluir?</span>
                              <button
                                onClick={() => void confirmarExclusao(m.id)}
                                className="font-semibold text-destructive hover:underline"
                              >Sim</button>
                              <span>/</span>
                              <button
                                onClick={() => setDeletandoId(null)}
                                className="hover:underline opacity-70"
                              >Não</button>
                            </span>
                          ) : null}
                        </div>
                        <p className="flex items-center gap-1 text-[10px] opacity-60 ml-auto">
                          {m.editedAt && !excluida && (
                            <span className="italic">(editada)</span>
                          )}
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {meu && mostrarRecibos && (
                            (m.leituras && m.leituras.length > 0) ? (
                              <span title={`Lido por ${m.leituras.map((l) => l.user.name).join(", ")}`} className="inline-flex">
                                <CheckCheck className="size-3 text-info" aria-label="Lido" />
                              </span>
                            ) : (
                              <span title="Enviado" className="inline-flex">
                                <Check className="size-3" aria-label="Enviado" />
                              </span>
                            )
                          )}
                        </p>
                      </div>

                      {/* Barra de reações */}
                      {!excluida && (m.reacoes?.length ?? 0) > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.reacoes!.map((r) => {
                            const minha = r.usuarios.some((u) => u.id === meId);
                            return (
                              <button
                                key={r.emoji}
                                onClick={() => toggleReacao(m.id, r.emoji)}
                                title={r.usuarios.map((u) => u.name).join(", ")}
                                className={cn(
                                  "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
                                  meu
                                    ? minha ? "border-primary-foreground/60 bg-primary-foreground/20" : "border-primary-foreground/20 hover:border-primary-foreground/40"
                                    : minha ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40",
                                )}
                              >
                                {r.emoji} <span className="opacity-70">{r.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                );
              })}
              {digitandoUsuarios.size > 0 && (
                <p className="px-1 text-xs italic text-muted-foreground">
                  {[...digitandoUsuarios.values()].join(", ")}{" "}
                  {digitandoUsuarios.size === 1 ? "está" : "estão"} digitando…
                </p>
              )}
              <div ref={fimRef} />
            </div>

            {/* Composer (oculto em modo observador — somente leitura) */}
            {canalSel.observador ? (
              <div className="flex items-center justify-center gap-1.5 border-t p-3 text-center text-xs text-muted-foreground">
                <Eye className="size-3.5" /> Modo observador (admin) — somente leitura.
              </div>
            ) : (
            <div className="relative border-t p-2">
              {respondendoA && (
                <div className="mb-2 flex items-start gap-2 rounded-sm border border-primary/30 bg-muted/40 px-2 py-1.5 text-xs">
                  <Reply className="mt-0.5 size-3 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-primary">{respondendoA.autor.name}</p>
                    <p className="truncate text-muted-foreground">{respondendoA.conteudo.slice(0, 100)}</p>
                  </div>
                  <button type="button" onClick={() => setRespondendoA(null)} aria-label="Cancelar resposta">
                    <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )}

              {anexo && (
                <div className="mb-2 flex items-center gap-2 rounded-sm border bg-muted/40 px-2 py-1 text-xs">
                  <Paperclip className="size-3 shrink-0" />
                  <span className="flex-1 truncate">{anexo.name}</span>
                  <button type="button" onClick={() => setAnexo(null)} aria-label="Remover anexo">
                    <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              )}
              {mencaoOpcoes.length > 0 && (
                <div
                  className="absolute bottom-full left-2 z-10 mb-1 w-56 overflow-hidden rounded-sm border bg-popover shadow-md"
                  role="listbox"
                  aria-label="Sugestões de menção"
                >
                  {mencaoOpcoes.map((u, i) => (
                    <button
                      key={u.id}
                      type="button"
                      role="option"
                      aria-selected={mencaoIndice === i}
                      onClick={() => { inserirMencao(u.name); setMencaoIndice(-1); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                        mencaoIndice === i && "bg-muted",
                      )}
                    >
                      <AtSign className="size-3 text-muted-foreground" />
                      <span className="truncate">{u.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {emojiAberto && (
                <div className="absolute bottom-full left-2 z-10 mb-1 grid w-64 grid-cols-8 gap-1 rounded-sm border bg-popover p-2 shadow-md">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setTexto((t) => t + e);
                        setEmojiAberto(false);
                        textareaRef.current?.focus();
                      }}
                      className="rounded-sm p-1 text-lg hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {gravando ? (
              <div className="flex items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2">
                <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                <span className="text-sm font-medium text-destructive">
                  Gravando… {Math.floor(gravSegundos / 60)}:{String(gravSegundos % 60).padStart(2, "0")}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button size="icon" variant="ghost" onClick={cancelarGravacao} aria-label="Cancelar gravação">
                    <X className="size-4" />
                  </Button>
                  <Button size="icon" onClick={pararGravacao} disabled={enviandoAnexo} aria-label="Enviar áudio">
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
              ) : (
              <div className="flex items-end gap-2">
                <input
                  ref={anexoRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    setAnexo(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <Button size="icon" variant="ghost" onClick={() => anexoRef.current?.click()} aria-label="Anexar arquivo">
                  <Paperclip className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEmojiAberto((v) => !v)} aria-label="Emoji">
                  <Smile className="size-4" />
                </Button>
                {!anexo && (
                  <Button size="icon" variant="ghost" onClick={iniciarGravacao} aria-label="Gravar áudio">
                    <Mic className="size-4" />
                  </Button>
                )}
                <textarea
                  ref={textareaRef}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    if (sel) {
                      if (e.target.value) {
                        if (!estaDigitandoRef.current) {
                          estaDigitandoRef.current = true;
                          getSocket().emit("digitando", { canalId: sel, digitando: true });
                        }
                        if (digitandoTimerRef.current) clearTimeout(digitandoTimerRef.current);
                        digitandoTimerRef.current = setTimeout(() => {
                          estaDigitandoRef.current = false;
                          digitandoTimerRef.current = null;
                          getSocket().emit("digitando", { canalId: sel, digitando: false });
                        }, 3000);
                      } else {
                        if (estaDigitandoRef.current) {
                          estaDigitandoRef.current = false;
                          getSocket().emit("digitando", { canalId: sel, digitando: false });
                        }
                        if (digitandoTimerRef.current) { clearTimeout(digitandoTimerRef.current); digitandoTimerRef.current = null; }
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    // C5-5: navega o popup de menção com teclado
                    if (mencaoOpcoes.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMencaoIndice((i) => (i + 1) % mencaoOpcoes.length);
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMencaoIndice((i) => (i <= 0 ? mencaoOpcoes.length - 1 : i - 1));
                        return;
                      }
                      if (e.key === "Enter" && mencaoIndice >= 0) {
                        e.preventDefault();
                        inserirMencao(mencaoOpcoes[mencaoIndice].name);
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setMencaoIndice(-1);
                        setTexto((t) => t.replace(REGEX_MENCAO_CURSOR, ""));
                        return;
                      }
                    }
                    if (emojiAberto && e.key === "Escape") { e.preventDefault(); setEmojiAberto(false); return; }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); }
                  }}
                  placeholder="Mensagem… (Shift+Enter para nova linha)"
                  rows={1}
                  className="flex-1 resize-none rounded-sm border border-input bg-background px-3 py-2 text-sm leading-snug placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="icon" onClick={enviar} disabled={enviandoAnexo} aria-label="Enviar">
                  <Send className="size-4" />
                </Button>
              </div>
              )}
            </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa.
          </div>
        )}
      </div>
    </div>
  );
}

function EncaminharDialog({
  canais,
  onClose,
  onEscolher,
}: {
  canais: CanalListItem[];
  onClose: () => void;
  onEscolher: (canalId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [enviando, setEnviando] = useState(false);
  const termo = q.trim().toLowerCase();
  const lista = termo ? canais.filter((c) => c.nome.toLowerCase().includes(termo)) : canais;

  async function escolher(id: string) {
    if (enviando) return;
    setEnviando(true);
    try { await onEscolher(id); } finally { setEnviando(false); }
  }

  function icone(c: CanalListItem) {
    if (c.tipo === "dm") return <AtSign className="size-4 shrink-0 text-muted-foreground" />;
    if (c.tipo === "grupo") return <CapaGrupo c={c} size={16} />;
    if (c.tipo === "socios") return <Briefcase className="size-4 shrink-0 text-muted-foreground" />;
    return <Hash className="size-4 shrink-0 text-muted-foreground" />;
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Encaminhar para…</DialogTitle></DialogHeader>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar conversa…"
          autoFocus
          className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {lista.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma conversa.</p>
          ) : lista.map((c) => (
            <button
              key={c.id}
              onClick={() => escolher(c.id)}
              disabled={enviando}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              {icone(c)}
              <span className="truncate">{c.nome}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CriarGrupoDialog({
  open,
  onClose,
  usuarios,
  onCriar,
}: {
  open: boolean;
  onClose: () => void;
  usuarios: { id: string; name: string; role: string }[];
  onCriar: (nome: string, membroIds: string[]) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  function toggleMembro(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!nome.trim() || selecionados.size === 0 || salvando) return;
    setSalvando(true);
    try { await onCriar(nome.trim(), [...selecionados]); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Novo grupo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do grupo"
            autoFocus
            className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs font-medium text-muted-foreground">Membros</p>
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {usuarios.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={selecionados.has(u.id)}
                  onChange={() => toggleMembro(u.id)}
                  className="rounded"
                />
                <span className="flex-1 truncate">{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.role}</span>
              </label>
            ))}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!nome.trim() || selecionados.size === 0 || salvando}
            className="w-full"
          >
            {salvando ? "Criando…" : `Criar grupo (${selecionados.size} membro${selecionados.size !== 1 ? "s" : ""})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GerenciarGrupoDialog({
  canal,
  meId,
  meRole,
  usuarios,
  onClose,
  onRenomear,
  onAdicionarMembro,
  onRemoverMembro,
  onDefinirIcone,
  onUploadCapa,
}: {
  canal: CanalListItem;
  meId: string;
  meRole: string;
  usuarios: { id: string; name: string; role: string }[];
  onClose: () => void;
  onRenomear: (nome: string) => Promise<void>;
  onAdicionarMembro: (uid: string) => Promise<void>;
  onRemoverMembro: (uid: string) => Promise<void>;
  onDefinirIcone: (icone: string | null) => Promise<void>;
  onUploadCapa: (file: File) => Promise<void>;
}) {
  const capaInputRef = useRef<HTMLInputElement>(null);
  const podeGerenciar = canal.criadoPorId === meId || ["admin", "supervisor"].includes(meRole);
  const membros = canal.grupoMembros ?? [];
  const membroIds = new Set(membros.map((m) => m.id));
  const candidatos = usuarios.filter((u) => !membroIds.has(u.id));
  const [novoNome, setNovoNome] = useState(canal.nome ?? "");
  const [addId, setAddId] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function run<T>(fn: () => Promise<T>) {
    if (salvando) return;
    setSalvando(true);
    try { await fn(); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <CapaGrupo c={canal} size={18} />
            {canal.nome ?? "Grupo"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {podeGerenciar && (
            <div className="flex gap-2">
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Renomear grupo"
                className="flex-1 rounded-sm border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!novoNome.trim() || novoNome === canal.nome || salvando}
                onClick={() => run(() => onRenomear(novoNome.trim()))}
              >
                Salvar
              </Button>
            </div>
          )}

          {/* Capa: galeria de ícones + upload de imagem */}
          {podeGerenciar && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Capa do grupo</p>
                <div className="flex items-center gap-2">
                  <CapaGrupo c={canal} size={20} />
                  <input
                    ref={capaInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void run(() => onUploadCapa(f));
                    }}
                  />
                  <button
                    onClick={() => capaInputRef.current?.click()}
                    disabled={salvando}
                    className="rounded-sm border border-input px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    Enviar imagem
                  </button>
                  {(canal.icone || canal.imagemCapa) && (
                    <button
                      onClick={() => run(() => onDefinirIcone(null))}
                      disabled={salvando}
                      title="Remover capa"
                      className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {ICONES_GRUPO.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => run(() => onDefinirIcone(emoji))}
                    disabled={salvando}
                    className={cn(
                      "rounded-sm p-1 text-lg hover:bg-muted",
                      canal.icone === emoji && "bg-muted ring-1 ring-primary",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Membros ({membros.length})
            </p>
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {membros.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-sm px-2 py-1 text-sm hover:bg-muted/30">
                  <span className="truncate">{m.name}</span>
                  {podeGerenciar && m.id !== meId && (
                    <button
                      onClick={() => run(() => onRemoverMembro(m.id))}
                      disabled={salvando}
                      title="Remover do grupo"
                      className="ml-2 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {podeGerenciar && candidatos.length > 0 && (
            <div className="flex gap-2">
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="flex-1 rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Adicionar membro…</option>
                {candidatos.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={!addId || salvando}
                onClick={() => run(async () => { await onAdicionarMembro(addId); setAddId(""); })}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}

          {membroIds.has(meId) && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              disabled={salvando}
              onClick={() => run(() => onRemoverMembro(meId))}
            >
              Sair do grupo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DMDialog({
  usuarios, online, statusUsuarios, onAbrir,
}: {
  usuarios: Usuario[];
  online: Set<string>;
  statusUsuarios: Map<string, string>;
  onAbrir: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="icon" variant="outline" aria-label="Nova conversa">
            <Plus className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conversar com…</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {usuarios.map((u) => {
            const isOnline = online.has(u.id);
            const st = statusUsuarios.get(u.id) ?? u.chatStatus ?? "disponivel";
            return (
              <button
                key={u.id}
                onClick={() => { onAbrir(u.id); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-sm p-2 text-left text-sm hover:bg-muted"
              >
                <Circle
                  className={cn(
                    "size-2 fill-current",
                    isOnline ? STATUS_COR[st] ?? STATUS_COR.disponivel : "text-muted-foreground/40",
                  )}
                />
                <span className="flex-1">{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.role}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
