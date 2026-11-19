/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useMemo } from "react";
// components
import { EditorWrapper } from "@/components/editors/editor-wrapper";
// extensions
import { EnterKeyExtension } from "@/extensions";
import { SlashCommands } from "@/extensions/slash-commands/root";
// types
import type { EditorRefApi, ILiteTextEditorProps } from "@/types";

function LiteTextEditor(props: ILiteTextEditorProps) {
  const {
    onEnterKeyPress,
    disabledExtensions,
    flaggedExtensions,
    editable,
    extensions: externalExtensions = [],
    slashCommandAdditionalOptions,
  } = props;

  const extensions = useMemo(() => {
    const resolvedExtensions = [...externalExtensions];

    // O comentário não tem "/" de formatação: ele aparece só para os itens a mais.
    if (editable && slashCommandAdditionalOptions?.length) {
      resolvedExtensions.push(
        SlashCommands({
          disabledExtensions,
          flaggedExtensions,
          additionalOptions: slashCommandAdditionalOptions,
          onlyAdditional: true,
        })
      );
    }

    if (!disabledExtensions?.includes("enter-key")) {
      resolvedExtensions.push(EnterKeyExtension(onEnterKeyPress));
    }

    return resolvedExtensions;
  }, [
    externalExtensions,
    disabledExtensions,
    flaggedExtensions,
    editable,
    slashCommandAdditionalOptions,
    onEnterKeyPress,
  ]);

  return <EditorWrapper {...props} extensions={extensions} />;
}

const LiteTextEditorWithRef = forwardRef(function LiteTextEditorWithRef(
  props: ILiteTextEditorProps,
  ref: React.ForwardedRef<EditorRefApi>
) {
  return <LiteTextEditor {...props} forwardedRef={ref as React.MutableRefObject<EditorRefApi | null>} />;
});

LiteTextEditorWithRef.displayName = "LiteTextEditorWithRef";

export { LiteTextEditorWithRef };
