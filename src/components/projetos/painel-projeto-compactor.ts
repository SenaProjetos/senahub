import { getCompactor } from "react-grid-layout/core";

/**
 * Mantém as posições escolhidas pela pessoa, sem permitir que dois cards
 * ocupem a mesma área. O compactador vertical padrão moveria cards para
 * cima após cada alteração e quebraria o alinhamento intencional do painel.
 */
export const projectPanelCompactor = getCompactor(null, false, true);
