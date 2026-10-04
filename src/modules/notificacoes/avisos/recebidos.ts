/**
 * Aviso como o destinatário o vê em "Avisos recebidos" (`/avisos`): o comunicado inteiro,
 * para reler depois que o modal sumiu. Puro — `queries.ts` busca as linhas e mapeia aqui.
 */
export type AvisoRecebido = {
  avisoId: string;
  titulo: string;
  corpo: string | null;
  /** Só se existe: a imagem sai pela rota autenticada `/api/avisos/<id>/imagem`. */
  temImagem: boolean;
  exigeConfirmacao: boolean;
  autor: string;
  /** Momento do disparo — o que a pessoa reconhece como "quando chegou". */
  recebidoEm: Date;
  /** Confirmação de leitura ("Li e entendi"); null = ainda não confirmou. */
  lidoEm: Date | null;
};

export type LinhaAvisoRecebido = {
  avisoId: string;
  lidoEm: Date | null;
  criadoEm: Date;
  aviso: {
    titulo: string;
    corpo: string | null;
    imagemPath: string | null;
    exigeConfirmacao: boolean;
    enviadoEm: Date | null;
    criadoPor: { name: string };
  };
};

export function avisoRecebidoDe(r: LinhaAvisoRecebido): AvisoRecebido {
  return {
    avisoId: r.avisoId,
    titulo: r.aviso.titulo,
    corpo: r.aviso.corpo,
    temImagem: !!r.aviso.imagemPath,
    exigeConfirmacao: r.aviso.exigeConfirmacao,
    autor: r.aviso.criadoPor.name,
    // Avisos de antes do agendamento não têm `enviadoEm`; a entrega nasceu no disparo.
    recebidoEm: r.aviso.enviadoEm ?? r.criadoEm,
    lidoEm: r.lidoEm,
  };
}
