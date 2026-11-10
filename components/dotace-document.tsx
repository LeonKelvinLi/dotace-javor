"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  Loader2,
} from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { StoredFile } from "@/lib/model";

export default function DotaceDocument({ file }: { file: StoredFile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(420);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const original = `/api/files?id=${encodeURIComponent(file.id)}`;

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    let destroyed = false;
    const destroyTask = () => {
      if (task && !destroyed) {
        destroyed = true;
        return task.destroy();
      }
      return Promise.resolve();
    };
    const controller = new AbortController();
    setDocument(null);
    setPage(1);
    setError("");
    setLoading(true);
    async function load() {
      try {
        const [pdfjs, response] = await Promise.all([
          import("pdfjs-dist"),
          fetch(original, {
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ]);
        if (!response.ok)
          throw new Error("Originál dokladu se nepodařilo načíst.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
        const pdf = await task.promise;
        if (!cancelled) setDocument(pdf);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Náhled PDF se nepodařilo otevřít.",
          );
      } finally {
        if (!cancelled) setLoading(false);
        if (cancelled) await destroyTask();
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      void destroyTask();
    };
  }, [original]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resize = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setWidth(Math.floor(entry.contentRect.width));
    });
    resize.observe(container);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;
    let renderTask:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendering(true);
    setError("");
    async function render() {
      try {
        const pdfPage = await document!.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const cssScale = Math.min(width, 900) / baseViewport.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: cssScale * pixelRatio });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.round(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.round(viewport.height / pixelRatio)}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Prohlížeč nepodporuje zobrazení PDF.");
        renderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Stranu se nepodařilo zobrazit.",
          );
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, page, width]);

  return (
    <div className="pdf-document">
      <div className="pdf-toolbar">
        <div className="pdf-pages">
          {document && document.numPages > 1 ? (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Předchozí strana PDF"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Strana {page} / {document.numPages}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Další strana PDF"
                disabled={page === document.numPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </>
          ) : (
            <span>{document ? "1 strana" : "Náhled PDF"}</span>
          )}
        </div>
        <a href={original} download={file.name} className="text-link">
          <Download size={13} />
          Originál
        </a>
      </div>
      <div
        ref={containerRef}
        className="pdf-canvas-wrap"
        aria-busy={loading || rendering}
      >
        {(loading || rendering) && !error && (
          <div className="pdf-loading" role="status">
            <Loader2 size={17} className="spin" />
            <span key={String(loading)}>{loading ? "Načítání dokladu…" : "Zobrazování strany…"}</span>
          </div>
        )}
        {error && (
          <div className="pdf-error" role="alert">
            <FileWarning size={24} />
            <strong>Náhled není dostupný</strong>
            <p>{error}</p>
            <a
              className="button secondary"
              href={original}
              target="_blank"
              rel="noreferrer"
            >
              Otevřít originál
            </a>
          </div>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Doklad ${file.name}, strana ${page}`}
          className={loading || error ? "pdf-canvas-hidden" : ""}
        />
      </div>
    </div>
  );
}
