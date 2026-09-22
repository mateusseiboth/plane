// Modelo único dos e-mails do sistema: título, parágrafos e um botão opcional.
// Sai em HTML e em texto puro (para cliente de e-mail que não mostra HTML).

export type EmailAction = { label: string; url: string };

export type EmailContent = {
  subject: string;
  title: string;
  paragraphs: string[];
  action?: EmailAction;
  footer?: string;
};

export type BuiltEmail = { subject: string; html: string; text: string };

const DEFAULT_FOOTER = "Mensagem automática. Não responda este e-mail.";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function buildActionHtml(action?: EmailAction): string {
  if (!action) return "";
  return `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#3f76ff;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#6b7280">Se o botão não abrir, copie este endereço no navegador: ${escapeHtml(action.url)}</p>`;
}

function buildHtml(content: EmailContent): string {
  const paragraphs = content.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
  const footer = escapeHtml(content.footer ?? DEFAULT_FOOTER);
  return `<!doctype html>
<html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px">${escapeHtml(content.title)}</h2>
${paragraphs}
${buildActionHtml(content.action)}
<p style="font-size:12px;color:#6b7280;margin-top:32px">${footer}</p>
</div></body></html>`;
}

function buildText(content: EmailContent): string {
  const action = content.action ? [`${content.action.label}: ${content.action.url}`] : [];
  return [content.title, "", ...content.paragraphs, "", ...action, "", content.footer ?? DEFAULT_FOOTER].join("\n");
}

export function buildEmail(content: EmailContent): BuiltEmail {
  return { subject: content.subject, html: buildHtml(content), text: buildText(content) };
}
