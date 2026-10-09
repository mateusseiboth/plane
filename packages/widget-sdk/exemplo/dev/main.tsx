/**
 * Só para `npm run dev`: inicializa o SDK como a home faz e monta o widget,
 * com um seletor para ver o widget em cada tamanho de cartão.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeSDK, type WidgetSize } from "@mateusseiboth/widgets-aviao";
import Widget from "../src/index";

initializeSDK({ baseUrl: window.location.origin, widgetId: "dev", workspaceSlug: "dev" });

const TAMANHOS: WidgetSize[] = ["1/3", "1/2", "2/3", "1/1"];
const LARGURA: Record<WidgetSize, string> = { "1/3": "33%", "1/2": "50%", "2/3": "66%", "1/1": "100%" };

function Bancada() {
  const [size, setSize] = useState<WidgetSize>("1/2");
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <label>
        Tamanho do cartão{" "}
        <select value={size} onChange={(e) => setSize(e.target.value as WidgetSize)}>
          {TAMANHOS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <section style={{ width: LARGURA[size], marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <Widget size={size} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Bancada />);
