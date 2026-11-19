/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// editors
export {
  CollaborativeDocumentEditorWithRef,
  DocumentEditorWithRef,
  LiteTextEditorWithRef,
  RichTextEditorWithRef,
} from "@/components/editors";

// constants
export * from "@/constants/common";

// helpers
export * from "@/helpers/common";
export * from "@/helpers/yjs-utils";

export { CORE_EXTENSIONS } from "@/constants/extension";
export { ADDITIONAL_EXTENSIONS } from "@/plane-editor/constants/extensions";

// types
export * from "@/types";

// additional exports
export { TrailingNode } from "./core/extensions/trailing-node";
export { createGhostTextExtension, GhostTextExtension, GHOST_TEXT_EXTENSION_NAME } from "./core/extensions/ghost-text";
export type { TGhostTextSource } from "./core/extensions/ghost-text";
export {
  BANCO_ANEXO_NODE,
  BANCO_ANEXO_TAG,
  createBancoAnexoExtension,
  insertBancoAnexo,
} from "./core/extensions/banco-anexo/extension";
export type { TBancoAnexoAttrs, TBancoAnexoRender } from "./core/extensions/banco-anexo/extension";
