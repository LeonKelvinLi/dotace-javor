# PDF and OCR asset notices

The following upstream assets are copied into `public/` so the browser can load the PDF/OCR workers, WebAssembly runtime and language models from this application. Their upstream licenses remain applicable; this file does not relicense them. Application dependency versions are pinned in `package-lock.json`.

| Component | Installed version / provenance | Local artifacts | License |
| --- | --- | --- | --- |
| [Mozilla PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | **6.5.438**, installed npm package | `public/pdf/pdf.worker.min.mjs`, from `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` | Apache-2.0; full copy at [`public/licenses/pdfjs-LICENSE.txt`](../public/licenses/pdfjs-LICENSE.txt). |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | **7.0.0**, installed npm package | `public/ocr/worker.min.js`, from `node_modules/tesseract.js/dist/worker.min.js` | Apache-2.0; full copy at [`public/licenses/tesseract-LICENSE.md`](../public/licenses/tesseract-LICENSE.md). The worker also carries bundled dependency notices; retain its accompanying `worker.min.js.LICENSE.txt`. |
| [Tesseract.js core](https://github.com/naptha/tesseract.js-core) | **7.0.0**, installed npm package | `public/ocr/tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-relaxedsimd-lstm.wasm.js`, copied from the package root | Apache-2.0; full copy at [`public/licenses/tesseract-core-LICENSE.txt`](../public/licenses/tesseract-core-LICENSE.txt). These JavaScript loaders include their WebAssembly payloads; no separate `.wasm` download is required for these copied builds. |
| Czech and English trained models | [naptha/tessdata](https://github.com/naptha/tessdata), `gh-pages/4.0.0_fast`, downloaded November 10, 2026 | `public/ocr/ces.traineddata.gz`, `public/ocr/eng.traineddata.gz` | The [upstream repository license](https://raw.githubusercontent.com/naptha/tessdata/gh-pages/LICENSE) is Apache-2.0. The `4.0.0_fast` model path is independent of the installed OCR engine's 7.0.0 version. |

Exact trained-model download sources:

- [Czech `ces.traineddata.gz`](https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/ces.traineddata.gz)
- [English `eng.traineddata.gz`](https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/eng.traineddata.gz)

Recorded SHA-256 checksums identify the downloaded bytes even if the upstream branch changes:

```text
8c49da9a1c6b224feb8ff314d6525c487af63e8653e42674c50b6426699f9d35  ces.traineddata.gz
18c1ac52b75e35d44735fb6c2a60acfaf23033524653200738e98f0243edb75b  eng.traineddata.gz
```

The upstream worker notice identifies additional bundled components: the browser Buffer module (MIT), ieee754 (BSD-3-Clause), regenerator-runtime (MIT), and zlib.js (MIT). Preserve the supplied notice file when copying or updating the worker. Upstream copyright holders retain their rights; no endorsement of this application is implied.

When upgrading, copy worker/core files from the exact newly installed packages, retain their license/notice files, update this record and verify Czech/English OCR with a fictional document. Do not substitute a live CDN dependency silently. The browser extraction path uses these same-origin assets; enabling the optional server AI endpoints is a separate data flow described in [HANDOVER.md](./HANDOVER.md).

## Direct PDF report

PDF-Lib 1.17.1 and @pdf-lib/fontkit 1.1.1 are installed npm packages (MIT licenses). PDF-Lib’s license and Fontkit’s supplied README/license notice are copied under `public/licenses/` (the Fontkit npm package does not supply a separate license file). Noto Sans Regular is vendored from [the official Noto repository](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf) at `public/fonts/NotoSans-Regular.ttf`, downloaded 10 November 2026. Its SIL Open Font License 1.1 is retained in `public/licenses/NotoSans-OFL.txt`. The font is embedded into generated reports to preserve Czech text.
