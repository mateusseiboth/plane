/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

// G5 — host bridges for the plugin SDK UI/navigation surfaces. Plugins run in-app
// (same window/React), so the SDK emits CustomEvents that this component turns into
// real host-rendered modals/drawers/confirms and host navigation. Mounted by
// DynamicPlugin so it is active whenever a plugin page is open.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { pluginStore } from "@/store/plugin.store";

type ModalState = { kind: "modal"; title: string; content: React.ReactNode; size?: "sm" | "md" | "lg" } | null;
type DrawerState = { kind: "drawer"; title: string; content: React.ReactNode; position?: "left" | "right" } | null;
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
} | null;

const SIZE_CLASS: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

export const PluginUiBridge: React.FC<{ pluginId: string; pluginSlug?: string }> = ({ pluginId, pluginSlug }) => {
  const router = useRouter();
  const { workspaceSlug } = useParams();
  const [modal, setModal] = useState<ModalState>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const closeModal = useCallback((cb?: () => void) => {
    setModal(null);
    cb?.();
  }, []);
  const closeDrawer = useCallback((cb?: () => void) => {
    setDrawer(null);
    cb?.();
  }, []);

  // ── plugin:ui (modal / drawer / confirm) ──────────────────────────────────
  useEffect(() => {
    const onUi = (e: Event) => {
      const d = (e as CustomEvent).detail as any;
      if (!d || d.source !== "plugin-sdk") return;
      switch (d.event) {
        case "modal:open":
          setModal({ kind: "modal", title: d.config?.title ?? "", content: d.config?.content ?? null, size: d.config?.size });
          break;
        case "modal:close":
          setModal(null);
          break;
        case "drawer:open":
          setDrawer({ kind: "drawer", title: d.config?.title ?? "", content: d.config?.content ?? null, position: d.config?.position });
          break;
        case "drawer:close":
          setDrawer(null);
          break;
        case "confirm:open":
          setConfirm({
            title: d.config?.title ?? "",
            message: d.config?.message ?? "",
            confirmLabel: d.config?.confirmLabel,
            cancelLabel: d.config?.cancelLabel,
            onConfirm: d.config?.onConfirm,
            onCancel: d.config?.onCancel,
          });
          break;
      }
    };
    window.addEventListener("plugin:ui", onUi as EventListener);
    return () => window.removeEventListener("plugin:ui", onUi as EventListener);
  }, []);

  // ── plugin:navigation (router + dynamic sidebar) ──────────────────────────
  useEffect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent).detail as any;
      if (!d || d.source !== "plugin-sdk") return;
      const slug = workspaceSlug?.toString();
      switch (d.event) {
        case "navigate": {
          // Navigate to one of THIS plugin's pages.
          if (!slug || !pluginSlug) return;
          const page = encodeURIComponent(d.page ?? "");
          const qs = new URLSearchParams({ page, ...(d.query ?? {}) }).toString();
          router.push(`/${slug}/plugins/${pluginSlug}?${qs}`);
          break;
        }
        case "navigate:path":
          if (typeof d.path === "string") router.push(d.path);
          break;
        case "sidebar:add":
          if (d.item?.id && d.item?.label && d.item?.page) {
            pluginStore.addRuntimeSidebarItem({
              pluginId: d.pluginId ?? pluginId,
              pluginSlug,
              id: String(d.item.id),
              label: String(d.item.label),
              icon: d.item.icon,
              page: String(d.item.page),
              order: typeof d.item.order === "number" ? d.item.order : undefined,
            });
          }
          break;
        case "sidebar:remove":
          if (d.id) pluginStore.removeRuntimeSidebarItem(d.pluginId ?? pluginId, String(d.id));
          break;
      }
    };
    window.addEventListener("plugin:navigation", onNav as EventListener);
    return () => window.removeEventListener("plugin:navigation", onNav as EventListener);
  }, [router, workspaceSlug, pluginSlug, pluginId]);

  return (
    <>
      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => closeModal()}>
          <div
            className={`w-full ${SIZE_CLASS[modal.size ?? "md"]} rounded-xl border border-custom-border-200 bg-custom-background-100 shadow-xl`}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-custom-border-200 px-5 py-3">
              <h3 className="text-base font-semibold text-custom-text-100">{modal.title}</h3>
              <button onClick={() => closeModal()} className="text-custom-text-400 hover:text-custom-text-100">
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5 text-sm text-custom-text-200">{modal.content}</div>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => closeDrawer()}>
          <div
            className={`fixed inset-y-0 ${drawer.position === "left" ? "left-0" : "right-0"} flex w-full max-w-md flex-col border-custom-border-200 bg-custom-background-100 shadow-xl`}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-custom-border-200 px-5 py-3">
              <h3 className="text-base font-semibold text-custom-text-100">{drawer.title}</h3>
              <button onClick={() => closeDrawer()} className="text-custom-text-400 hover:text-custom-text-100">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-sm text-custom-text-200">{drawer.content}</div>
          </div>
        </div>
      )}

      {/* Confirm */}
      {confirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-custom-border-200 bg-custom-background-100 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-custom-text-100">{confirm.title}</h3>
            <p className="mt-2 text-sm text-custom-text-200">{confirm.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  const cb = confirm.onCancel;
                  setConfirm(null);
                  cb?.();
                }}
                className="rounded-md border border-custom-border-200 px-3 py-1.5 text-sm text-custom-text-200 hover:bg-custom-background-80"
              >
                {confirm.cancelLabel ?? "Cancelar"}
              </button>
              <button
                onClick={() => {
                  const cb = confirm.onConfirm;
                  setConfirm(null);
                  cb?.();
                }}
                className="rounded-md bg-custom-primary-100 px-3 py-1.5 text-sm font-medium text-white hover:bg-custom-primary-200"
              >
                {confirm.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
