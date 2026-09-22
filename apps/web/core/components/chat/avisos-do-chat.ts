/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Som e aviso do navegador do chat.
 *
 * Nasceram dentro da tela do atendente. Agora o atendimento também chega a quem
 * está em outra tela do sistema, e o alerta precisa ser o MESMO nos dois lugares:
 * dois bipes diferentes para o mesmo fato confundem mais do que avisam.
 */

/** Bipe curto de atendimento chegando. Falhou o áudio, o aviso visual resolve. */
export function playAlert() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 350);
  } catch {
    /* ignora */
  }
}

/**
 * Aviso do sistema operacional, só quando a permissão JÁ foi concedida.
 *
 * Quem nunca respondeu não é perguntado aqui: a pergunta do navegador aparecendo
 * na abertura do sistema, sem contexto, é recusada e depois não dá para pedir de
 * novo. A tela do chat é o lugar de pedir.
 *
 * Fora de HTTPS o navegador já marca a permissão como negada, e não há o que
 * fazer no código.
 */
export function notifyDesktop(title: string, body: string, tag = "plane-chat") {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const aviso = new Notification(title, { body, icon: "/favicon.ico", tag });
    aviso.addEventListener("click", () => {
      window.focus();
      aviso.close();
    });
  } catch {
    /* ignora */
  }
}
