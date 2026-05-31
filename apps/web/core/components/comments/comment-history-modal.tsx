"use client";

import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X } from "lucide-react";
import { calculateTimeAgo } from "@plane/utils";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

class CommentVersionService extends APIService {
  constructor() { super(API_BASE_URL); }
  async list(workspaceSlug: string, projectId: string, issueId: string, commentId: string): Promise<any[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/${commentId}/versions/`
    )
      .then((r) => r?.data ?? [])
      .catch(() => []);
  }
}

const versionService = new CommentVersionService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  commentId: string;
};

export function CommentHistoryModal({ isOpen, onClose, workspaceSlug, projectId, issueId, commentId }: Props) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    versionService.list(workspaceSlug, projectId, issueId, commentId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [isOpen, commentId]);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-full max-w-lg rounded-xl bg-surface-1 p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <Dialog.Title className="text-base font-semibold">Histórico de edições</Dialog.Title>
                <button onClick={onClose} className="rounded p-1 text-secondary hover:bg-surface-2 hover:text-primary">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loading && <p className="py-4 text-center text-13 text-secondary">Carregando...</p>}
              {!loading && versions.length === 0 && (
                <p className="py-4 text-center text-13 text-secondary">Nenhuma versão anterior encontrada.</p>
              )}

              <div className="max-h-80 space-y-3 overflow-y-auto">
                {versions.map((v) => (
                  <div key={v.id} className="rounded-lg border border-subtle p-3">
                    <p className="mb-1.5 text-11 text-tertiary">{calculateTimeAgo(v.created_at)}</p>
                    <div
                      className="prose prose-sm max-w-none text-13 text-primary"
                      dangerouslySetInnerHTML={{ __html: v.comment_html }}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={onClose}
                  className="rounded px-3 py-1.5 text-13 font-medium text-secondary hover:text-primary transition-colors"
                >
                  Fechar
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
