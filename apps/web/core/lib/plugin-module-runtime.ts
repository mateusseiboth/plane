/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Plataforma: runtime de carregamento de bundles de plugin com COMPARTILHAMENTO da
// instância de React do host. Plugins rodam in-app (montados na árvore React do
// host), então PRECISAM usar a mesma instância de React — senão os hooks quebram.
//
// Como bundles de plugin são ESM com specifiers "bare" (`import ... from "react"`)
// e não há import map global, resolvemos isso de forma contida: expomos os módulos
// do host em window, geramos shims ESM (blob) que reexportam desses globais, e
// reescrevemos os specifiers do bundle para os blobs antes do import(). Genérico e
// reutilizável por qualquer plugin (e futuramente widgets).

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JsxRuntime from "react/jsx-runtime";
import * as PluginSDKModule from "@mateusseiboth/plugins-aviao";

const g = globalThis as any;
g.__PLUGIN_REACT__ ??= React;
g.__PLUGIN_REACTDOM__ ??= ReactDOM;
g.__PLUGIN_REACTDOM_CLIENT__ ??= ReactDOMClient;
g.__PLUGIN_JSX__ ??= JsxRuntime;
g.__PLUGIN_SDK_MODULE__ ??= PluginSDKModule;

// Shim ESM por specifier: reexporta dos globais do host (mesma instância).
function shimSource(spec: string): string {
  switch (spec) {
    case "react":
      return `const R=window.__PLUGIN_REACT__;export default R;export const {Children,Component,Fragment,Profiler,PureComponent,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=R;`;
    case "react/jsx-runtime":
      return `const J=window.__PLUGIN_JSX__;export const Fragment=J.Fragment;export const jsx=J.jsx;export const jsxs=J.jsxs;`;
    case "react/jsx-dev-runtime":
      return `const J=window.__PLUGIN_JSX__;export const Fragment=J.Fragment;export const jsxDEV=J.jsxDEV||J.jsx;`;
    case "react-dom":
      return `const D=window.__PLUGIN_REACTDOM__;export default D;export const {createPortal,flushSync,version}=D;`;
    case "react-dom/client":
      return `const C=window.__PLUGIN_REACTDOM_CLIENT__;export default C;export const {createRoot,hydrateRoot}=C;`;
    case "@mateusseiboth/plugins-aviao":
      return `const M=window.__PLUGIN_SDK_MODULE__;export default M;export const {initializeSDK,workerItemsApi,intakesApi,actionsApi,statsApi,usersApi,entitiesApi,storageApi,notificationsApi,uiApi,navigationApi,pagesApi,configApi,permissionsApi,backendApi,useWorkerItems,useWorkerItem,useIntakes,useIntake,useActions,useAction,useStats,useEntities,useEntity,useUsers,useCurrentUser,sdkRequest,sdkFetchRaw}=M;`;
    default:
      return "";
  }
}

const SHARED_SPECS = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@mateusseiboth/plugins-aviao",
];

let shimUrls: Map<string, string> | null = null;
function ensureShims(): Map<string, string> {
  if (shimUrls) return shimUrls;
  shimUrls = new Map();
  for (const spec of SHARED_SPECS) {
    const url = URL.createObjectURL(new Blob([shimSource(spec)], { type: "text/javascript" }));
    shimUrls.set(spec, url);
  }
  return shimUrls;
}

function rewriteImports(code: string): string {
  const urls = ensureShims();
  for (const [spec, url] of urls) {
    const esc = spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    // from "spec" | import "spec" | import("spec")
    code = code.replace(new RegExp(`(from\\s*|import\\s*\\(?\\s*)(["'])${esc}\\2`, "g"), (_m, p1, q) => `${p1}${q}${url}${q}`);
  }
  return code;
}

/**
 * Carrega o bundle ESM de um plugin compartilhando o React do host. Retorna o
 * namespace do módulo (com `default` e exports nomeados).
 */
export async function loadPluginModule(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Falha ao carregar o bundle do plugin: ${url} (${res.status})`);
  const rewritten = rewriteImports(await res.text());
  const blobUrl = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as Record<string, unknown>;
  } finally {
    // Mantém o blob por um tempo (sourcemaps/async) e então libera.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}
