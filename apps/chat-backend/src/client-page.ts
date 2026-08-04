// Self-contained embeddable client chat page (no build step, iframe-friendly).
// Talks only to this backend: POST /sessions/ then a single WebSocket. No polling.
// Persists a browserId in localStorage so reloads return to the same session.

export function clientPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Suporte</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
/* ── Reset & root ─────────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}

/* ── Theme tokens ─────────────────────────────────────────────── */
:root{
  --brand:#4f46e5;
  --brand-dark:#3730a3;
  --brand-light:#ede9fe;
  --bg:#f8f9fc;
  --surface:#ffffff;
  --border:#e5e7eb;
  --txt:#111827;
  --txt2:#6b7280;
  --txt3:#9ca3af;
  --bubble-out:linear-gradient(135deg,#4f46e5,#7c3aed);
  --bubble-in:#ffffff;
  --shadow-sm:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);
  --shadow:0 4px 16px rgba(0,0,0,.10);
  --shadow-lg:0 10px 40px rgba(0,0,0,.14);
  --radius:20px;
  --radius-sm:12px;
}
@media(prefers-color-scheme:dark){
  :root{
    --bg:#0f1117;
    --surface:#1a1f2e;
    --border:#2d3348;
    --txt:#e8eaf0;
    --txt2:#9aa3b8;
    --txt3:#6b7280;
    --bubble-in:#252c3f;
  }
}

/* ── Layout ───────────────────────────────────────────────────── */
#app{
  display:flex;flex-direction:column;height:100%;
  background:var(--bg);
  font-size:14px;color:var(--txt);
  overflow:hidden;
}
@media(min-width:480px){
  body{display:grid;place-items:center;background:var(--bg)}
  #app{
    width:420px;height:min(700px,96vh);
    border-radius:24px;overflow:hidden;
    box-shadow:var(--shadow-lg);
  }
}

/* ── Header ───────────────────────────────────────────────────── */
#header{
  flex-shrink:0;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  padding:14px 18px 16px;
  display:flex;align-items:center;gap:12px;
  position:relative;overflow:hidden;
}
#header::before{
  content:'';position:absolute;inset:0;
  background:radial-gradient(circle at 70% -20%,rgba(255,255,255,.15) 0%,transparent 60%);
}
.hava{
  width:44px;height:44px;border-radius:50%;
  background:rgba(255,255,255,.2);
  border:2px solid rgba(255,255,255,.4);
  display:grid;place-items:center;
  font-weight:700;font-size:18px;color:#fff;
  flex-shrink:0;backdrop-filter:blur(8px);
  position:relative;z-index:1;
}
.hinfo{flex:1;min-width:0;position:relative;z-index:1}
.hname{font-size:15px;font-weight:650;color:#fff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hsub{font-size:12px;color:rgba(255,255,255,.8);margin-top:3px;display:flex;align-items:center;gap:6px}
.dot-online{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.3);flex-shrink:0}
#hend{
  flex-shrink:0;
  background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);
  color:#fff;border-radius:10px;padding:7px 14px;
  font-size:13px;font-weight:500;cursor:pointer;
  transition:.15s;backdrop-filter:blur(4px);
  position:relative;z-index:1;
}
#hend:hover{background:rgba(255,255,255,.25)}

/* ── Unread indicator ─────────────────────────────────────────── */
#unread-bar{
  display:none;
  background:var(--brand);color:#fff;
  text-align:center;padding:8px;font-size:12px;font-weight:500;
  cursor:pointer;flex-shrink:0;
}
#unread-bar.on{display:block}

/* ── Messages area ────────────────────────────────────────────── */
#msgs{
  flex:1;overflow-y:auto;
  padding:20px 16px;
  display:flex;flex-direction:column;gap:12px;
  scroll-behavior:smooth;
}
#msgs::-webkit-scrollbar{width:5px}
#msgs::-webkit-scrollbar-track{background:transparent}
#msgs::-webkit-scrollbar-thumb{background:var(--border);border-radius:999px}

/* ── Message rows ─────────────────────────────────────────────── */
.row{display:flex;flex-direction:column;max-width:78%;animation:popIn .2s ease}
@keyframes popIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.row.out{align-self:flex-end;align-items:flex-end}
.row.in,.row.bot{align-self:flex-start;align-items:flex-start}
.row.sys{align-self:center;max-width:90%;align-items:center}

.avatar-sm{
  width:28px;height:28px;border-radius:50%;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  color:#fff;font-size:11px;font-weight:700;
  display:grid;place-items:center;flex-shrink:0;
  margin-bottom:4px;
}

.bubble{
  padding:10px 14px;
  border-radius:18px;
  line-height:1.5;
  white-space:pre-wrap;word-break:break-word;
  position:relative;
  box-shadow:var(--shadow-sm);
}
.out .bubble{
  background:var(--bubble-out);color:#fff;
  border-bottom-right-radius:5px;
}
.in .bubble,.bot .bubble{
  background:var(--bubble-in);color:var(--txt);
  border:1px solid var(--border);
  border-bottom-left-radius:5px;
}
.sys .bubble{
  background:transparent;box-shadow:none;
  color:var(--txt3);font-size:12px;text-align:center;
  border:1px dashed var(--border);
  border-radius:999px;padding:5px 14px;
}
.sender-name{font-size:11px;font-weight:600;color:var(--brand);margin-bottom:4px;margin-left:4px}
.bubble.deleted{font-style:italic;color:var(--txt3);background:transparent;border:1px dashed var(--border);box-shadow:none}
.ts .edited{font-style:italic;opacity:.8}

/* Ações da própria mensagem (editar / apagar) — aparecem ao passar o mouse */
.row.out{position:relative}
.msg-actions{
  position:absolute;top:2px;left:-4px;transform:translateX(-100%);
  display:flex;gap:2px;opacity:0;pointer-events:none;transition:opacity .15s ease;
}
.row.out:hover .msg-actions,.msg-actions:focus-within{opacity:1;pointer-events:auto}
.msg-actions button{
  border:1px solid var(--border);background:var(--bubble-in);color:var(--txt3);
  border-radius:8px;width:24px;height:24px;display:grid;place-items:center;cursor:pointer;padding:0;
}
.msg-actions button:hover{color:var(--txt)}
.edit-box{display:flex;flex-direction:column;gap:6px;min-width:190px}
.edit-box textarea{
  width:100%;resize:vertical;min-height:52px;font:inherit;color:var(--txt);
  background:var(--bubble-in);border:1px solid var(--border);border-radius:10px;padding:6px 8px;
}
.edit-box .edit-btns{display:flex;gap:6px;justify-content:flex-end}
.edit-box .edit-btns button{
  border:1px solid var(--border);background:transparent;color:var(--txt);
  border-radius:8px;padding:3px 10px;cursor:pointer;font-size:12px;
}
.edit-box .edit-btns button.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.ts{font-size:10.5px;color:var(--txt3);margin-top:4px;padding:0 4px;display:flex;align-items:center;gap:4px}
.out .ts{justify-content:flex-end}
.check{opacity:.6}
.check.read{color:#818cf8;opacity:1}

.bubble img,.bubble video{max-width:220px;border-radius:12px;display:block;margin-bottom:4px}
.bubble audio{width:180px;height:36px;margin-bottom:4px}
.bubble a{color:inherit;font-weight:600;text-decoration:underline;word-break:break-all}
.bubble .file-row{display:flex;align-items:center;gap:8px;padding:4px 0}
.file-icon{width:32px;height:32px;border-radius:8px;background:rgba(79,70,229,.12);display:grid;place-items:center;color:var(--brand);font-size:14px;flex-shrink:0}

/* ── Typing indicator ─────────────────────────────────────────── */
#typing{
  align-self:flex-start;display:none;
  align-items:center;gap:4px;
  padding:12px 16px;
  background:var(--bubble-in);border:1px solid var(--border);
  border-radius:18px;border-bottom-left-radius:5px;
  box-shadow:var(--shadow-sm);
  animation:popIn .2s ease;
}
#typing.on{display:flex}
#typing i{
  width:7px;height:7px;border-radius:50%;
  background:var(--txt3);animation:bounce 1.3s infinite;
}
#typing i:nth-child(2){animation-delay:.15s}
#typing i:nth-child(3){animation-delay:.3s}
@keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}

/* ── Date separator ───────────────────────────────────────────── */
.date-sep{align-self:center;font-size:11px;color:var(--txt3);background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:3px 12px;margin:4px 0}

/* ── Ended state ──────────────────────────────────────────────── */
#ended{
  display:none;flex-direction:column;align-items:center;
  justify-content:center;gap:16px;padding:40px 24px;text-align:center;
  flex:1;
}
#ended .ended-icon{
  width:72px;height:72px;border-radius:50%;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  display:grid;place-items:center;
  box-shadow:0 8px 24px rgba(79,70,229,.35);
}
#ended .ended-icon svg{width:32px;height:32px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
#ended h2{font-size:20px;font-weight:700;color:var(--txt)}
#ended p{font-size:14px;color:var(--txt2);max-width:260px;line-height:1.6}
.proto-badge{
  font-size:12px;color:var(--txt2);
  background:var(--bg);border:1px solid var(--border);
  border-radius:999px;padding:6px 16px;font-family:monospace;font-weight:600;
}
#restart{
  border:none;border-radius:14px;padding:13px 24px;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  color:#fff;font-size:14px;font-weight:600;
  cursor:pointer;transition:.15s;
  box-shadow:0 4px 14px rgba(79,70,229,.4);
}
#restart:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(79,70,229,.5)}

/* ── Rating form ──────────────────────────────────────────────── */
#rating-view,#done-view{display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:300px}
.stars{display:flex;gap:6px}
.stars button{
  background:none;border:none;cursor:pointer;
  font-size:38px;line-height:1;padding:0;
  color:var(--border);transition:transform .1s,color .12s;
}
.stars button:hover{transform:scale(1.15)}
.stars button.on{color:#fbbf24}
#rating-comment{
  width:100%;border:1.5px solid var(--border);border-radius:14px;
  padding:10px 14px;font-size:14px;font-family:inherit;line-height:1.4;
  background:var(--bg);color:var(--txt);resize:none;outline:none;
  transition:border-color .15s;
}
#rating-comment:focus{border-color:var(--brand)}
#rating-submit{
  width:100%;border:none;border-radius:14px;padding:13px 24px;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;
  box-shadow:0 4px 14px rgba(79,70,229,.4);
}
#rating-submit:hover:not(:disabled){transform:translateY(-1px)}
#rating-submit:disabled{opacity:.45;cursor:default;box-shadow:none}
.link-btn{background:none;border:none;color:var(--txt2);font-size:13px;cursor:pointer;text-decoration:underline}
.link-btn:hover{color:var(--txt)}
#dog{max-width:240px;max-height:200px;width:auto;border-radius:18px;box-shadow:var(--shadow);object-fit:cover}
#dog:not([src]),#dog[src=""]{display:none}
.dog-loading{
  display:flex;flex-direction:column;align-items:center;gap:10px;
  width:240px;height:160px;justify-content:center;
  border-radius:18px;background:var(--bg);border:1px solid var(--border);
  color:var(--txt3);font-size:12px;
}
.dog-loading .spin{
  width:30px;height:30px;border-radius:50%;
  border:3px solid var(--border);border-top-color:var(--brand);
  animation:dogspin .8s linear infinite;
}
@keyframes dogspin{to{transform:rotate(360deg)}}

/* ── Pre-chat form ────────────────────────────────────────────────── */
#prechat{display:none;flex:1;flex-direction:column;overflow-y:auto;padding:26px 22px;gap:18px}
#prechat.on{display:flex}
#prechat .pc-head{display:flex;flex-direction:column;gap:6px;text-align:center;align-items:center}
#prechat .pc-icon{
  width:60px;height:60px;border-radius:50%;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  display:grid;place-items:center;margin-bottom:4px;
  box-shadow:0 8px 24px rgba(79,70,229,.35);
}
#prechat .pc-icon svg{width:28px;height:28px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#prechat h2{font-size:18px;font-weight:700;color:var(--txt)}
#prechat p.pc-sub{font-size:13px;color:var(--txt2);line-height:1.5;max-width:280px}
.pc-field{display:flex;flex-direction:column;gap:6px}
.pc-field label{font-size:12px;font-weight:600;color:var(--txt2)}
.pc-field input,.pc-field select{
  width:100%;border:1.5px solid var(--border);border-radius:12px;
  padding:11px 14px;font-size:14px;font-family:inherit;
  background:var(--bg);color:var(--txt);outline:none;transition:border-color .15s;
}
.pc-field input:focus,.pc-field select:focus{border-color:var(--brand)}
.pc-att-list{display:flex;flex-direction:column;gap:8px}
.pc-att{
  display:flex;align-items:center;gap:10px;width:100%;
  border:1.5px solid var(--border);border-radius:12px;padding:9px 12px;
  background:var(--bg);color:var(--txt);cursor:pointer;text-align:left;
  font-size:14px;transition:.15s;
}
.pc-att:hover{border-color:var(--brand)}
.pc-att.sel{border-color:var(--brand);background:var(--brand-light)}
@media(prefers-color-scheme:dark){.pc-att.sel{background:rgba(79,70,229,.18)}}
.pc-att .pc-ava{
  width:34px;height:34px;border-radius:50%;flex-shrink:0;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center;
}
.pc-att .pc-meta{flex:1;min-width:0}
.pc-att .pc-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-att .pc-st{font-size:11px;color:var(--txt3);display:flex;align-items:center;gap:5px}
.pc-att .pc-st .dot{width:7px;height:7px;border-radius:50%;background:#9ca3af}
.pc-att .pc-st.online .dot{background:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.3)}
#pc-submit{
  margin-top:4px;border:none;border-radius:14px;padding:13px 24px;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:.15s;
  box-shadow:0 4px 14px rgba(79,70,229,.4);
}
#pc-submit:hover:not(:disabled){transform:translateY(-1px)}
#pc-submit:disabled{opacity:.5;cursor:default;box-shadow:none}

/* ── Footer / input ───────────────────────────────────────────── */
#footer{
  flex-shrink:0;
  display:flex;align-items:flex-end;gap:8px;
  padding:12px 14px;
  border-top:1px solid var(--border);
  background:var(--surface);
}
.ic-btn{
  width:40px;height:40px;flex-shrink:0;
  border:none;border-radius:12px;background:transparent;
  color:var(--txt3);cursor:pointer;
  display:grid;place-items:center;transition:.15s;
}
.ic-btn:hover{background:var(--bg);color:var(--txt)}
.ic-btn svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ic-btn.rec{color:#ef4444;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

#txt-wrap{flex:1;min-width:0;position:relative}
#txt{
  width:100%;padding:10px 16px;
  border:1.5px solid var(--border);border-radius:22px;
  font-size:14px;line-height:1.4;
  background:var(--bg);color:var(--txt);
  resize:none;overflow:hidden;max-height:120px;
  outline:none;font-family:inherit;
  transition:border-color .15s;display:block;
}
#txt:focus{border-color:var(--brand)}
#txt::placeholder{color:var(--txt3)}

#send{
  width:42px;height:42px;flex-shrink:0;
  border:none;border-radius:50%;
  background:linear-gradient(135deg,var(--brand),#7c3aed);
  color:#fff;cursor:pointer;
  display:grid;place-items:center;
  transition:.15s;
  box-shadow:0 4px 12px rgba(79,70,229,.4);
}
#send:hover{transform:scale(1.07);box-shadow:0 6px 16px rgba(79,70,229,.5)}
#send:disabled{opacity:.4;cursor:default;transform:none;box-shadow:none}
#send svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}

/* ── Drag overlay ─────────────────────────────────────────────── */
.drag{outline:3px dashed var(--brand);outline-offset:-8px}

/* ── Scrollbar reveal on hover ────────────────────────────────── */
#msgs:hover::-webkit-scrollbar-thumb{background:var(--border)}
</style>
</head>
<body>
<div id="app">
  <!-- Header -->
  <div id="header">
    <div class="hava" id="hava">S</div>
    <div class="hinfo">
      <div class="hname" id="hname">Suporte</div>
      <div class="hsub"><span class="dot-online"></span><span id="hsub">Online · aguardando</span></div>
    </div>
    <button id="hend">Encerrar</button>
  </div>

  <div id="unread-bar" onclick="scrollToBottom()">↓ Nova mensagem</div>

  <!-- Pre-chat form (native widget) -->
  <div id="prechat">
    <div class="pc-head">
      <div class="pc-icon">
        <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      </div>
      <h2>Iniciar atendimento</h2>
      <p class="pc-sub">Preencha os dados abaixo para começarmos.</p>
    </div>

    <div class="pc-field">
      <label for="pc-name">Seu nome</label>
      <input id="pc-name" type="text" placeholder="Como podemos te chamar?" autocomplete="name" />
    </div>

    <div class="pc-field" id="pc-project-field">
      <label for="pc-project">Sistema / projeto</label>
      <select id="pc-project"><option value="">Selecione…</option></select>
    </div>

    <div class="pc-field" id="pc-att-field">
      <label>Atendente (opcional)</label>
      <div class="pc-att-list" id="pc-att-list"></div>
    </div>

    <button id="pc-submit">Iniciar atendimento</button>
  </div>

  <!-- Messages -->
  <div id="msgs"></div>
  <div id="typing" aria-label="digitando"><i></i><i></i><i></i></div>

  <!-- Ended -->
  <div id="ended">
    <!-- Rating form (shown first if not yet rated) -->
    <div id="rating-view" style="display:none">
      <div class="ended-icon">
        <svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
      </div>
      <h2>Como foi o atendimento?</h2>
      <p>Sua avaliação nos ajuda a melhorar. Dê uma nota de 1 a 5.</p>
      <div class="stars" id="stars">
        <button type="button" data-v="1">★</button>
        <button type="button" data-v="2">★</button>
        <button type="button" data-v="3">★</button>
        <button type="button" data-v="4">★</button>
        <button type="button" data-v="5">★</button>
      </div>
      <textarea id="rating-comment" placeholder="Deixe um comentário (opcional)…" rows="3"></textarea>
      <button id="rating-submit" disabled>Enviar avaliação</button>
      <button id="rating-skip" class="link-btn">Pular</button>
    </div>

    <!-- Thank-you / closed view (with a cute dog 🐶) -->
    <div id="done-view" style="display:none">
      <div id="dog-loading" class="dog-loading"><div class="spin"></div><span>Buscando um cachorro fofo…</span></div>
      <img id="dog" alt="Um cachorro fofo para alegrar o seu dia" />
      <div class="ended-icon">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2>Atendimento encerrado</h2>
      <p>Obrigado pelo contato! Caso precise de mais ajuda, inicie um novo atendimento.</p>
      <div class="proto-badge" id="ended-proto"></div>
      <button id="restart">Iniciar novo atendimento</button>
    </div>
  </div>

  <!-- Input -->
  <div id="footer">
    <input id="file" type="file" hidden />
    <button type="button" class="ic-btn" id="attach" title="Anexar arquivo">
      <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
    </button>
    <button type="button" class="ic-btn" id="mic" title="Gravar áudio">
      <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
    </button>
    <div id="txt-wrap">
      <textarea id="txt" placeholder="Escreva sua mensagem…" rows="1" autocomplete="off"></textarea>
    </div>
    <button id="send" title="Enviar" disabled>
      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    </button>
  </div>
</div>

<script type="module">
const params = new URLSearchParams(location.search);
const WORKSPACE = params.get("workspace");
const API = (params.get("api") || (location.origin + "/chat-api")).replace(/\\/$/, "");
// On localhost dev, the WS goes directly to backend port 8002 (nginx WS proxying
// can loop on the Upgrade). Behind a real domain, :8002 isn't exposed, so go
// through the proxy at /chat-ws. ?ws= overrides. Match the page scheme so https
// pages use wss:// (browsers block mixed ws://).
const wsScheme = location.protocol === "https:" ? "wss" : "ws";
const isLocalHost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
let WS = params.get("ws") || (isLocalHost ? wsScheme + "://" + location.hostname + ":8002/ws" : wsScheme + "://" + location.host + "/chat-ws");
if (location.protocol === "https:" && WS.startsWith("ws://")) WS = "wss://" + WS.slice(5);
const LS_KEY = "chat_bid_" + WORKSPACE;

const $ = id => document.getElementById(id);
const msgs = $("msgs");
let ws, token, sessionId, protocol, typingTimer, atBottom = true;

// ── Helpers ──────────────────────────────────────────────────────
function browserId() {
  let id = localStorage.getItem(LS_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(LS_KEY, id); }
  return id;
}
function esc(s) { return (s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmt(ts) {
  try { return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function mediaUrl(key, mime) {
  if (!key) return null;
  if (key.startsWith("ext:")) return key.slice(4);
  return API + "/media/" + key + (mime ? "?mime=" + encodeURIComponent(mime) : "");
}
function scrollToBottom(force) {
  if (force || atBottom) msgs.scrollTop = msgs.scrollHeight;
}

// ── Auto-expand textarea ──────────────────────────────────────────
const txt = $("txt");
const send = $("send");
txt.addEventListener("input", () => {
  txt.style.height = "auto";
  txt.style.height = Math.min(txt.scrollHeight, 120) + "px";
  send.disabled = !txt.value.trim();
});

// ── Detect if user scrolled up ────────────────────────────────────
msgs.addEventListener("scroll", () => {
  atBottom = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 40;
  if (atBottom) $("unread-bar").classList.remove("on");
});

// ── Build a message row element (deleted/edited aware) ─────────────
function buildRow(m) {
  if (m.sender === "system") {
    const r = document.createElement("div");
    r.className = "row sys"; r.dataset.id = m.id;
    r.appendChild(Object.assign(document.createElement("div"), { className: "bubble", textContent: m.text || "" }));
    return r;
  }

  const isOut = m.sender === "client";
  const r = document.createElement("div");
  r.className = "row " + (isOut ? "out" : (m.sender === "bot" ? "bot" : "in"));
  r.dataset.id = m.id;

  // Sender name for attendant
  if (!isOut && m.sender === "attendant" && m.sender_name) {
    const sn = document.createElement("div");
    sn.className = "sender-name";
    sn.textContent = m.sender_name;
    r.appendChild(sn);
  }

  const b = document.createElement("div");
  b.className = "bubble";

  // Deleted → the client only ever sees a redacted placeholder.
  if (m.deleted_at) {
    b.classList.add("deleted");
    b.textContent = "🚫 Mensagem apagada";
    r.appendChild(b);
    return r;
  }

  const url = mediaUrl(m.media_key, m.media_mime);
  if (url && m.type === "image") {
    const img = document.createElement("img");
    img.src = url; img.loading = "lazy"; img.alt = m.media_name || "";
    b.appendChild(img);
  } else if (url && m.type === "video") {
    const v = document.createElement("video");
    v.src = url; v.controls = true; b.appendChild(v);
  } else if (url && m.type === "audio") {
    const a = document.createElement("audio");
    a.src = url; a.controls = true; b.appendChild(a);
  } else if (url) {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = '<div class="file-icon"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.textContent = m.media_name || "Arquivo";
    row.appendChild(a);
    b.appendChild(row);
  }

  if (m.text) {
    const span = document.createElement("span");
    span.textContent = m.text;
    b.appendChild(span);
  }
  r.appendChild(b);

  // Ações da própria mensagem de texto: editar e apagar.
  if (isOut && m.type === "text") r.appendChild(buildActions(m));

  // Timestamp (+ edited marker, + delivery check for own messages)
  if (m.created_at) {
    const ts = document.createElement("div");
    ts.className = "ts";
    ts.innerHTML = '<span>' + fmt(m.created_at) + '</span>';
    if (m.edited_at) ts.innerHTML += '<span class="edited">· editado</span>';
    if (isOut) ts.innerHTML += '<span class="check" title="Enviado">✓✓</span>';
    r.appendChild(ts);
  }
  return r;
}

// ── Editar / apagar a própria mensagem ────────────────────────────
function buildActions(m) {
  const box = document.createElement("div");
  box.className = "msg-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.title = "Editar mensagem";
  edit.setAttribute("aria-label", "Editar mensagem");
  edit.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
  edit.onclick = () => startEdit(m);

  const del = document.createElement("button");
  del.type = "button";
  del.title = "Apagar mensagem";
  del.setAttribute("aria-label", "Apagar mensagem");
  del.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  del.onclick = () => {
    if (!confirm("Apagar esta mensagem?")) return;
    sendWs({ type: "client.delete", message_id: m.id });
  };

  box.appendChild(edit);
  box.appendChild(del);
  return box;
}

// Troca a bolha por um editor inline; Enter salva, Esc cancela.
function startEdit(m) {
  const row = msgs.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(m.id) : m.id) + '"]');
  if (!row) return;
  const bubble = row.querySelector(".bubble");
  if (!bubble || bubble.querySelector("textarea")) return;

  const original = m.text || "";
  bubble.innerHTML = "";
  const box = document.createElement("div");
  box.className = "edit-box";
  const area = document.createElement("textarea");
  area.value = original;
  const btns = document.createElement("div");
  btns.className = "edit-btns";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancelar";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary";
  save.textContent = "Salvar";

  const restore = () => renderMessage(m);
  const commit = () => {
    const text = area.value.trim();
    if (!text || text === original) return restore();
    sendWs({ type: "client.edit", message_id: m.id, text: text });
    // A confirmação chega pelo evento message.edit do servidor.
    renderMessage({ ...m, text: text });
  };

  cancel.onclick = restore;
  save.onclick = commit;
  area.onkeydown = (e) => {
    if (e.key === "Escape") return restore();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  };

  btns.appendChild(cancel);
  btns.appendChild(save);
  box.appendChild(area);
  box.appendChild(btns);
  bubble.appendChild(box);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
}

// ── Render a message (replaces an existing row in place on edit/delete) ─
function renderMessage(m) {
  const existing = msgs.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(m.id) : m.id) + '"]');
  const row = buildRow(m);
  if (existing) { existing.replaceWith(row); return; }
  msgs.appendChild(row);
  if (!atBottom) $("unread-bar").classList.add("on");
  scrollToBottom();
}

// Redact a message the attendant deleted (client only gets the id).
function redactMessage(id) {
  const r = msgs.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  if (!r) return;
  const b = r.querySelector(".bubble");
  if (!b) return;
  b.classList.add("deleted");
  b.innerHTML = "";
  b.textContent = "🚫 Mensagem apagada";
  const ts = r.querySelector(".ts");
  if (ts) ts.remove();
}

// ── Set header ────────────────────────────────────────────────────
function setHeader(name, sub) {
  const n = name || "Suporte";
  $("hava").textContent = (n[0] || "S").toUpperCase();
  $("hname").textContent = n;
  if (sub) $("hsub").textContent = sub;
}

// ── Show ended screen (rating first, then thank-you + dog) ────────
let chosenScore = 0;

function showEnded(alreadyRated) {
  $("footer").style.display = "none";
  msgs.style.display = "none";
  $("typing").style.display = "none";
  $("unread-bar").style.display = "none";
  $("prechat").classList.remove("on");
  // The chat is over — hide the "Encerrar" action so it can't be triggered again,
  // and reflect the ended state in the header.
  $("hend").style.display = "none";
  $("hsub").textContent = "Atendimento encerrado";
  const dot = document.querySelector(".dot-online");
  if (dot) dot.style.background = "var(--txt3)";
  $("ended-proto").textContent = protocol ? "Protocolo " + protocol : "";
  $("ended").style.display = "flex";
  if (alreadyRated) showDone();
  else { $("rating-view").style.display = "flex"; $("done-view").style.display = "none"; }
}

function showDone() {
  $("rating-view").style.display = "none";
  $("done-view").style.display = "flex";
  loadDog();
}

// ── Random dog 🐶 ──────────────────────────────────────────────────
async function loadDog() {
  const img = $("dog");
  const loader = $("dog-loading");
  const hideLoader = () => { if (loader) loader.style.display = "none"; };
  if (loader) loader.style.display = "flex";
  img.removeAttribute("src");
  try {
    const d = await (await fetch(API + "/random-dog/")).json();
    if (d && d.url) {
      img.onload = hideLoader;
      img.onerror = hideLoader;
      img.src = d.url;
    } else {
      hideLoader();
    }
  } catch {
    hideLoader(); // no dog today
  }
}

// ── Rating interactions ───────────────────────────────────────────
function paintStars(v) {
  [...$("stars").children].forEach((b) => b.classList.toggle("on", Number(b.dataset.v) <= v));
}
[...$("stars").children].forEach((b) => {
  b.addEventListener("mouseenter", () => paintStars(Number(b.dataset.v)));
  b.addEventListener("click", () => {
    chosenScore = Number(b.dataset.v);
    paintStars(chosenScore);
    $("rating-submit").disabled = false;
  });
});
$("stars").addEventListener("mouseleave", () => paintStars(chosenScore));

$("rating-submit").onclick = async () => {
  if (!chosenScore || !sessionId) return;
  $("rating-submit").disabled = true;
  try {
    await fetch(API + "/sessions/" + sessionId + "/rate/?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: chosenScore, comment: $("rating-comment").value.trim() || null }),
    });
  } catch { /* ignore — still thank the client */ }
  showDone();
};
$("rating-skip").onclick = () => showDone();

// ── Pre-chat (native): collect name + system (project) + attendant ─────────
// URL pre-fills any of these: ?name=, ?system=<project identifier> | ?project=<id>,
// ?attendant=<user id> (so the consuming system can inject the logged-in user).
const PREFILL = {
  name: params.get("name") || "",
  system: params.get("system") || "",   // project identifier (e.g. SIART)
  project: params.get("project") || "", // project uuid (alternative to system)
  attendant: params.get("attendant") || "",
};
let pcAttendant = ""; // selected attendant id ("" = any available)

function showChat() {
  $("prechat").classList.remove("on");
  $("ended").style.display = "none";
  msgs.style.display = "";
  $("footer").style.display = "";
  $("hend").style.display = "";
}

async function showPrechat() {
  $("prechat").classList.add("on");
  msgs.style.display = "none";
  $("footer").style.display = "none";
  $("ended").style.display = "none";
  $("pc-name").value = PREFILL.name;
  pcAttendant = PREFILL.attendant;

  // Systems = Plane projects.
  try {
    const r = await (await fetch(API + "/workspaces/" + encodeURIComponent(WORKSPACE) + "/public/projects/")).json();
    const sel = $("pc-project");
    (r.results || []).forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.dataset.identifier = p.identifier || "";
      o.textContent = p.name + (p.identifier ? " (" + p.identifier + ")" : "");
      sel.appendChild(o);
    });
    if (PREFILL.project) sel.value = PREFILL.project;
    else if (PREFILL.system) {
      const match = [...sel.options].find((o) => (o.dataset.identifier || "").toUpperCase() === PREFILL.system.toUpperCase());
      if (match) sel.value = match.value;
    }
    if (sel.options.length <= 1) $("pc-project-field").style.display = "none";
  } catch { $("pc-project-field").style.display = "none"; }

  // Attendants the client may route to directly.
  try {
    const r = await (await fetch(API + "/workspaces/" + encodeURIComponent(WORKSPACE) + "/public/attendants/")).json();
    const list = $("pc-att-list");
    list.innerHTML = "";
    const atts = (r.results || []).slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    if (!atts.length) { $("pc-att-field").style.display = "none"; return; }

    const mkBtn = (id, name, online, any) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pc-att" + (pcAttendant === id ? " sel" : "");
      b.dataset.id = id;
      const ava = any ? "★" : esc((name[0] || "?").toUpperCase());
      const st = any ? "" : '<div class="pc-st ' + (online ? "online" : "") + '"><span class="dot"></span>' + (online ? "Online" : "Offline") + "</div>";
      b.innerHTML = '<div class="pc-ava">' + ava + '</div><div class="pc-meta"><div class="pc-name">' + esc(name) + "</div>" + st + "</div>";
      b.onclick = () => {
        pcAttendant = id;
        [...list.children].forEach((c) => c.classList.toggle("sel", c.dataset.id === id));
      };
      return b;
    };
    list.appendChild(mkBtn("", "Qualquer atendente disponível", false, true));
    atts.forEach((a) => list.appendChild(mkBtn(a.user_id, a.name, a.online, false)));
    if (!pcAttendant && !list.querySelector(".pc-att.sel")) list.firstChild.classList.add("sel");
  } catch { $("pc-att-field").style.display = "none"; }
}

function syncUrl(name, sel) {
  try {
    const u = new URL(location.href);
    if (name) u.searchParams.set("name", name);
    const ident = sel && sel.selectedOptions[0] ? (sel.selectedOptions[0].dataset.identifier || "") : "";
    if (ident) u.searchParams.set("system", ident);
    if (pcAttendant) u.searchParams.set("attendant", pcAttendant); else u.searchParams.delete("attendant");
    history.replaceState(null, "", u.toString());
  } catch { /* non-blocking */ }
}

$("pc-submit").onclick = async () => {
  const name = $("pc-name").value.trim();
  const sel = $("pc-project");
  const projectId = sel ? sel.value : "";
  if ($("pc-project-field").style.display !== "none" && !projectId) {
    sel.focus();
    sel.style.borderColor = "#ef4444";
    return;
  }
  $("pc-submit").disabled = true;
  try {
    const res = await fetch(API + "/sessions/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: WORKSPACE,
        browser_id: browserId(),
        name: name || null,
        project_id: projectId || null,
        attendant_id: pcAttendant || null,
      }),
    });
    if (!res.ok) throw new Error("Falha ao iniciar sessão (" + res.status + ")");
    const data = await res.json();
    syncUrl(name, sel);
    await resumeSession(data);
  } catch {
    $("pc-submit").disabled = false;
    alert("Não foi possível iniciar o atendimento. Tente novamente.");
  }
};

// Recarrega e re-renderiza o histórico (usado ao abrir a sessão e para desfazer
// um efeito otimista quando o servidor recusa uma ação).
async function reloadHistory() {
  const hist = await (await fetch(API + "/sessions/" + sessionId + "/messages/?token=" + encodeURIComponent(token))).json();
  msgs.innerHTML = "";
  (hist.results || []).forEach(renderMessage);
  return hist;
}

// ── Resume an existing/just-created session: load history + connect ─────────
async function resumeSession(data) {
  token = data.token; sessionId = data.session.id; protocol = data.session.protocol;
  showChat();
  setHeader(null, "Protocolo " + protocol);
  try {
    const hist = await reloadHistory();

    if (hist.session) {
      if (hist.session.status === "closed") {
        showEnded(hist.session.rating_score != null || hist.session.rating_state === "done");
        return;
      }
      if (hist.session.assigned_attendant_id) $("hsub").textContent = "Em atendimento · Protocolo " + protocol;
    }
    connect();
  } catch {
    msgs.innerHTML = '<div style="padding:24px;text-align:center;color:var(--txt2);font-size:13px">Não foi possível conectar ao suporte. Por favor, tente novamente.</div>';
  }
}

// ── Boot: resume an open session for this browser, else show the pre-chat form ─
async function start() {
  try {
    const r = await (await fetch(API + "/sessions/active/?workspace=" + encodeURIComponent(WORKSPACE) + "&browser_id=" + encodeURIComponent(browserId()))).json();
    if (r && r.session) { await resumeSession(r); return; }
  } catch { /* fall through to the pre-chat form */ }
  await showPrechat();
}

// Tell the server we've read the conversation (→ attendant sees blue checks).
function sendRead() {
  if (document.visibilityState === "visible") sendWs({ type: "client.read" });
}
// Re-confirm reads when the client returns to the tab.
document.addEventListener("visibilitychange", sendRead);

// ── WebSocket ─────────────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS + "?token=" + encodeURIComponent(token));

  ws.onopen = () => sendRead();

  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
    if (m.type === "message.new") {
      $("typing").classList.remove("on");
      renderMessage(m.message);
      // An attendant/bot message arrived and we're looking → mark read immediately.
      if (m.message && m.message.sender !== "client") sendRead();
      return;
    }
    if (m.type === "message.edit") { renderMessage(m.message); return; }
    if (m.type === "message.delete") { redactMessage(m.message_id); return; }
    // Ação recusada pelo servidor (ex.: mensagem de outra pessoa): avisa e
    // recarrega o histórico para desfazer o efeito otimista da UI.
    if (m.type === "error") { alert(m.detail || "Não foi possível concluir a ação."); reloadHistory(); return; }
    if (m.type === "typing" && m.who === "attendant") {
      $("typing").classList.add("on");
      scrollToBottom();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => $("typing").classList.remove("on"), 3000);
      return;
    }
    if (m.type === "session.assigned") {
      $("hsub").textContent = "Em atendimento · Protocolo " + protocol;
      return;
    }
    if (m.type === "session.closed") {
      protocol = m.protocol || protocol;
      showEnded();
    }
  };

  ws.onclose = () => { if (ws) setTimeout(connect, 2500); };
}

// ── Send ──────────────────────────────────────────────────────────
function sendWs(p) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(p)); }

function submit() {
  const t = txt.value.trim();
  if (!t || !token) return;
  sendWs({ type: "client.message", text: t });
  txt.value = "";
  txt.style.height = "auto";
  send.disabled = true;
}

send.onclick = submit;
txt.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
txt.addEventListener("input", () => sendWs({ type: "client.typing" }));

// ── Attach ────────────────────────────────────────────────────────
$("attach").onclick = () => $("file").click();
$("file").onchange = () => { if ($("file").files[0]) upload($("file").files[0]); };
document.addEventListener("paste", e => {
  const f = [...(e.clipboardData?.files || [])][0];
  if (f) upload(f);
});
$("app").addEventListener("dragover", e => { e.preventDefault(); $("app").classList.add("drag"); });
$("app").addEventListener("dragleave", () => $("app").classList.remove("drag"));
$("app").addEventListener("drop", e => {
  e.preventDefault(); $("app").classList.remove("drag");
  const f = [...(e.dataTransfer?.files || [])][0];
  if (f) upload(f);
});
async function upload(file) {
  const fd = new FormData(); fd.append("file", file);
  const r = await (await fetch(API + "/sessions/" + sessionId + "/upload/?token=" + encodeURIComponent(token), { method: "POST", body: fd })).json();
  const t = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file";
  sendWs({ type: "client.message", media_key: r.media_key, media_mime: r.media_mime, media_name: r.media_name, media_type: t });
}

// ── Audio recording ───────────────────────────────────────────────
let rec, chunks = [];
$("mic").onclick = async () => {
  if (rec && rec.state === "recording") {
    rec.stop();
    $("mic").classList.remove("rec");
    $("mic").title = "Gravar áudio";
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream); chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      upload(new File([new Blob(chunks, { type: "audio/webm" })], "audio.webm", { type: "audio/webm" }));
      stream.getTracks().forEach(t => t.stop());
    };
    rec.start();
    $("mic").classList.add("rec");
    $("mic").title = "Parar gravação";
  } catch { alert("Não foi possível acessar o microfone."); }
};

// ── End / restart ─────────────────────────────────────────────────
let ended = false;
$("hend").onclick = () => {
  if (ended) return;
  if (!confirm("Deseja encerrar o atendimento?")) return;
  ended = true;
  sendWs({ type: "client.end" });
  localStorage.removeItem(LS_KEY);
  showEnded();
};
$("restart").onclick = () => { localStorage.removeItem(LS_KEY); location.reload(); };

// ── Boot ──────────────────────────────────────────────────────────
if (!WORKSPACE) {
  msgs.innerHTML = '<div style="padding:24px;text-align:center;color:var(--txt2);font-size:13px">Configuração inválida: parâmetro <code>?workspace=</code> ausente.</div>';
} else {
  start();
}
</script>
</body>
</html>`;
}
