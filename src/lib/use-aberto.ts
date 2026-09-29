"use client";

import { useState } from "react";

/**
 * Janela aberta DE FORA — por um item de menu (botão direito, ⋯) ou um atalho que não é o
 * botão dela. Quem passa `controle` manda no aberto/fechado, e o componente não desenha o
 * próprio botão; sem `controle`, ele funciona como sempre, com o botão e o estado dele.
 */
export type ControleJanela = { aberto: boolean; aoMudar: (aberto: boolean) => void };

export function useAberto(controle?: ControleJanela): [boolean, (aberto: boolean) => void] {
  const [interno, setInterno] = useState(false);
  return controle ? [controle.aberto, controle.aoMudar] : [interno, setInterno];
}
