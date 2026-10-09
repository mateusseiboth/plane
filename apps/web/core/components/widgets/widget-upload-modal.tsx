"use client";

import React, { useRef, useState } from "react";

interface WidgetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  /** Título do modal. Padrão: Enviar widget. */
  titulo?: string;
  /** Uma frase abaixo do título, quando o envio tem um efeito que a pessoa precisa saber. */
  aviso?: string;
}

export const WidgetUploadModal: React.FC<WidgetUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  isUploading,
  titulo = "Enviar widget",
  aviso,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".zip")) {
      setError("Apenas arquivos .zip são aceitos.");
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    try {
      await onUpload(selectedFile);
      setSelectedFile(null);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Falha ao enviar o arquivo.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="shadow-xl dark:bg-neutral-900 w-full max-w-md rounded-xl bg-white p-6">
        <h2 className="text-lg text-neutral-900 font-semibold dark:text-white">{titulo}</h2>
        {aviso && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{aviso}</p>}
        <div className="mb-4" />

        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-neutral-300 hover:border-blue-400 dark:border-neutral-600"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="text-3xl text-neutral-400">📦</div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            {selectedFile ? selectedFile.name : "Arraste e solte widget.zip ou clique para procurar"}
          </p>
        </div>

        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => {
              setSelectedFile(null);
              setError(null);
              onClose();
            }}
            className="text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 rounded-lg px-4 py-2"
            disabled={isUploading}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || isUploading}
            className="bg-blue-600 text-sm hover:bg-blue-700 rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {isUploading ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
};
