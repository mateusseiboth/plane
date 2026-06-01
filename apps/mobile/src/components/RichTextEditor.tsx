/**
 * WebView-based rich text editor. Rather than depend on a network CDN, it ships
 * a self-contained contenteditable surface with a formatting toolbar that mirrors
 * the web editor's core marks/blocks: bold, italic, underline, strike, H1–H3,
 * bullet & ordered lists, blockquote, inline code and links.
 *
 * - Output is HTML (compatible with the API's `description_html` / comment HTML).
 * - Editing happens entirely on-device, so it works fully offline.
 * - `RichTextViewer` renders read-only HTML with the same styling.
 */
import React, { useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

import { useTheme } from "@/theme";
import { Text } from "./ui";

function escapeForTemplate(html: string): string {
  // Embed safely inside a JS template literal in the page bootstrap.
  return html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function buildHtml(opts: { colors: any; initial: string; editable: boolean; placeholder: string }): string {
  const { colors, initial, editable, placeholder } = opts;
  const toolbar = editable
    ? `
    <div id="tb">
      <button data-cmd="bold"><b>B</b></button>
      <button data-cmd="italic"><i>I</i></button>
      <button data-cmd="underline"><u>U</u></button>
      <button data-cmd="strikeThrough"><s>S</s></button>
      <span class="sep"></span>
      <button data-block="h1">H1</button>
      <button data-block="h2">H2</button>
      <button data-block="h3">H3</button>
      <span class="sep"></span>
      <button data-cmd="insertUnorderedList">• List</button>
      <button data-cmd="insertOrderedList">1. List</button>
      <button data-block="blockquote">❝</button>
      <button data-block="pre">&lt;/&gt;</button>
      <span class="sep"></span>
      <button data-link="1">🔗</button>
      <button data-cmd="removeFormat">⌫</button>
    </div>`
    : "";

  return `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    body { margin:0; background:${colors.surface}; color:${colors.text};
      font-family:-apple-system, Roboto, sans-serif; font-size:15px; }
    #tb { position:sticky; top:0; display:flex; flex-wrap:wrap; gap:4px; padding:8px;
      background:${colors.surfaceElevated}; border-bottom:1px solid ${colors.border}; }
    #tb button { background:${colors.surfaceSunken}; color:${colors.text}; border:1px solid ${colors.border};
      border-radius:6px; padding:6px 9px; font-size:13px; min-width:32px; }
    #tb button:active { background:${colors.primaryMuted}; }
    .sep { width:1px; background:${colors.border}; margin:2px 2px; }
    #ed { min-height:140px; padding:14px; outline:none; line-height:1.5; }
    #ed:empty:before { content: attr(data-ph); color:${colors.textTertiary}; }
    #ed h1 { font-size:22px; } #ed h2 { font-size:19px; } #ed h3 { font-size:16px; }
    #ed blockquote { border-left:3px solid ${colors.primary}; margin:8px 0; padding:2px 12px; color:${colors.textSecondary}; }
    #ed pre { background:${colors.surfaceSunken}; padding:10px; border-radius:8px; overflow:auto; font-family:monospace; }
    #ed a { color:${colors.primary}; }
    #ed img { max-width:100%; border-radius:8px; }
  </style></head><body>
  ${toolbar}
  <div id="ed" ${editable ? "contenteditable=true" : ""} data-ph="${placeholder.replace(/"/g, "&quot;")}"></div>
  <script>
    var ed = document.getElementById('ed');
    ed.innerHTML = \`${escapeForTemplate(initial || "")}\`;
    function post() {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type:'change', html: ed.innerHTML }));
    }
    ${editable ? `
    document.getElementById('tb').addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return; e.preventDefault(); ed.focus();
      if (b.dataset.cmd) document.execCommand(b.dataset.cmd, false, null);
      else if (b.dataset.block) document.execCommand('formatBlock', false, b.dataset.block);
      else if (b.dataset.link) { var url = prompt('URL do link'); if(url) document.execCommand('createLink', false, url); }
      post();
    });
    ed.addEventListener('input', post);
    ed.addEventListener('blur', post);
    ` : ""}
    window.addEventListener('message', function(e){
      try { var msg = JSON.parse(e.data); if (msg.type==='setContent'){ ed.innerHTML = msg.html||''; } } catch(_){}
    });
  </script></body></html>`;
}

export function RichTextEditor({
  value,
  onChange,
  editable = true,
  placeholder = "Escreva aqui…",
  minHeight = 200,
}: {
  value: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  minHeight?: number;
}) {
  const { colors, radius } = useTheme();
  const ref = useRef<WebView>(null);
  // Bake the initial value into the page once; later keystrokes flow out via onChange.
  const html = useMemo(
    () => buildHtml({ colors, initial: value, editable, placeholder }),
    // Rebuild only when theme or editability changes (not on every keystroke).
    [colors, editable, placeholder],
  );

  return (
    <View style={{ minHeight, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html }}
        style={{ backgroundColor: colors.surface }}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === "change") onChange?.(msg.html);
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

export function RichTextViewer({ html, minHeight = 80 }: { html: string; minHeight?: number }) {
  const { colors } = useTheme();
  if (!html || html === "<p></p>") {
    return <Text variant="tertiary">Sem descrição.</Text>;
  }
  const page = useMemo(() => buildHtml({ colors, initial: html, editable: false, placeholder: "" }), [colors, html]);
  return (
    <View style={{ minHeight }}>
      <WebView originWhitelist={["*"]} source={{ html: page }} style={{ backgroundColor: colors.surface, flex: 1, minHeight }} scrollEnabled={false} />
    </View>
  );
}
