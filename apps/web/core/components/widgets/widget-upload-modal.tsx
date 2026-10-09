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
      <div className="shadow-xl w-full max-w-md rounded-xl bg-surface-1 p-6">
        <h2 className="text-16 font-semibold text-primary">{titulo}</h2>
        {aviso && <p className="mt-1 text-13 text-tertiary">{aviso}</p>}
        <div className="mb-4" />

        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragging ? "border-accent-strong bg-accent-subtle" : "border-subtle hover:border-accent-strong"
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
          <div className="text-24 text-tertiary">📦</div>
          <p className="mt-2 text-13 text-tertiary">
            {selectedFile ? selectedFile.name : "Arraste e solte widget.zip ou clique para procurar"}
          </p>
        </div>

        {error && <p className="mt-2 text-13 text-danger-primary">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => {
              setSelectedFile(null);
              setError(null);
              onClose();
            }}
            className="rounded-lg px-4 py-2 text-13 text-secondary hover:bg-layer-1"
            disabled={isUploading}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || isUploading}
            className="rounded-lg bg-accent-primary px-4 py-2 text-13 font-medium text-on-color hover:opacity-90 disabled:opacity-50"
          >
            {isUploading ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
};
