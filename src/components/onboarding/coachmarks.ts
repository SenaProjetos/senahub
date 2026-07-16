/**
 * Registro dos guias de primeiro acesso (coachmarks), por rota. Client-safe, sem I/O.
 *
 * Cada passo aponta um `alvo` (seletor CSS — use `[data-tour="..."]` nos elementos)
 * e traz título + texto curto. O provider mostra o guia no primeiro acesso da tela e
 * grava `tour_visto:<rota>` nas preferências do usuário (UserPreference) ao concluir.
 * Passos cujo alvo não existir na tela são simplesmente pulados — seguro adicionar
 * passos que só aparecem para certos perfis.
 *
 * Para cobrir uma tela nova: adicione `data-tour="x"` nos elementos e um item aqui.
 */

export type PassoGuia = {
  /** Seletor CSS do elemento a destacar (ex.: `[data-tour="nav"]`). */
  alvo: string;
  titulo: string;
  texto: string;
};

export type Guia = {
  /** Rota da tela. "/" casa exato; as demais casam a própria rota e subrotas. */
  rota: string;
  /** Suba quando mudar os passos para reexibir a quem já viu a versão anterior. */
  versao?: number;
  passos: PassoGuia[];
};

export const GUIAS: Guia[] = [
  {
    rota: "/",
    passos: [
      { alvo: '[data-tour="nav"]', titulo: "Menu principal", texto: "Navegue entre os módulos do SenaHub por aqui. Clique em Minimizar para ganhar espaço." },
      { alvo: '[data-tour="busca"]', titulo: "Busca rápida", texto: "Encontre projetos, pessoas e telas em segundos. Atalho: Ctrl + K." },
      { alvo: '[data-tour="notificacoes"]', titulo: "Notificações", texto: "Prazos, aprovações e avisos chegam no sino — e por push, se ativado." },
      { alvo: '[data-tour="conta"]', titulo: "Sua conta", texto: "Foto, nome, tema e sair. Você pode rever este guia por aqui quando quiser." },
    ],
  },
  {
    rota: "/preferencias",
    passos: [
      { alvo: '[data-tour="perfil-foto"]', titulo: "Sua foto", texto: "Ao enviar, você ajusta o enquadramento (zoom e reposição) antes de salvar." },
      { alvo: '[data-tour="aparencia"]', titulo: "Tema da interface", texto: "Claro, escuro ou acompanhando o sistema — salvo neste dispositivo." },
      { alvo: '[data-tour="notificacoes-pref"]', titulo: "Notificações automáticas", texto: "Ligue ou desligue cada categoria de alerta. Não afeta os outros usuários." },
    ],
  },
  {
    rota: "/configuracoes/avisos",
    passos: [
      { alvo: '[data-tour="aviso-mensagem"]', titulo: "Monte o comunicado", texto: "Título, mensagem e, se quiser, uma imagem que aparece no aviso e no e-mail." },
      { alvo: '[data-tour="aviso-preview"]', titulo: "Pré-visualização", texto: "Alterne entre como o aviso fica no sistema e no e-mail antes de enviar." },
    ],
  },
];

/** Guia da rota atual (casa "/" exato; as demais por prefixo de subrota). */
export function guiaParaRota(pathname: string): Guia | null {
  return (
    GUIAS.find((g) =>
      g.rota === "/" ? pathname === "/" : pathname === g.rota || pathname.startsWith(g.rota + "/"),
    ) ?? null
  );
}

/** Chave da preferência que marca o guia como visto. Inclui a versão, se houver. */
export function chaveGuia(g: Guia): string {
  return `tour_visto:${g.rota}${g.versao ? `@${g.versao}` : ""}`;
}
