/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function MaintenanceMessage() {
  const linkMap = [
    {
      key: "mail_to",
      label: "Falar com o suporte",
      value: "mailto:support@plane.so",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-left text-18 font-semibold text-primary">
          &#x1F6A7; Parece que o Plane não iniciou corretamente!
        </h1>
        <span className="text-left text-14 font-medium text-secondary">
          Alguns serviços podem não ter iniciado. Verifique os logs dos containers para identificar e resolver o
          problema. Se precisar de ajuda, fale com a nossa equipe de suporte.
        </span>
      </div>
      <div className="mt-1 flex items-center justify-start gap-6">
        {linkMap.map((link) => (
          <div key={link.key}>
            <a
              href={link.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-13 text-accent-primary hover:underline"
            >
              {link.label}
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
