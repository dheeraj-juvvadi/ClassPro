# Mobile cold-start OCR: smaller models and runtimes

Read-only desk research for the observed mobile cold start (`>=10 s` model load vs ~2 s
credential entry). No training, no download >20 MB, no credentials, no production change.
Everything here is about the **cold** path; warm-latency figures are labelled and are not
evidence about cold start.

## Baseline in this repo (verified)

`portal-app/public/ocr/` — bytes on disk, gzip measured locally with `gzip -9`:

| Asset | raw | gzip |
| --- | --- | --- |
| `ort-wasm-simd-threaded.wasm` | 13,961,845 | 3,570,014 |
| `ort-wasm-simd-threaded.mjs` | 24,218 | 9,047 |
| `ort.wasm.min.js` | 50,196 | 16,097 |
| `portal-alnum.onnx` | 5,230,935 | 3,664,714 |
| `charset.json` | 314 | 135 |

The phone fetches ~7.26 MB gzip and must decompress and compile ~19.2 MB raw before the
first token: the model is about 27% of the raw total. Model bytes are not compiled as WebAssembly.

**Correction to the brief.** 11.2 MB matches `onnxruntime-web@1.20.0` = 11,241,642
(jsDelivr, verified). This repo ships 1.29.0 = 13,961,845, byte-identical to npm. Verified
spread: 1.17.0 = 10,646,108 / 1.20.0 = 11,241,642 / 1.29.0 = 13,961,845, so that version increases the download; cold-start time depends on more than size. 1.29.0 offers only four wasm variants — 13.96 MB (default, used
here), 16.03 (jspi), 25.75 (asyncify), 27.80 (jsep) — no smaller build to pick.

Unchanged from `docs/srmap-ocr-capacity.md` (verified there): `ddddocr==1.5.6` loads
`common_old.onnx` = 13,606,051 bytes, not the 54,088,400-byte `common.onnx`.

## Search result: no suitable small drop-in model found

Searched the HF model index (`search=captcha`, plus the `onnx` filter, sorted by
downloads, exact per-file sizes via API), GitHub repo and code search, and npm.
**No permissively licensed, <2 MB raw, mixed-case, 6-char pretrained CAPTCHA model with
downloadable weights was found in any of them.**

Nearest by size is the 1.79 MB Luogu model (lowercase-only, option 3). Everything else is
>=4.7 MB: commonly 19-57 MB CRNNs (`milang/captcha-solver` 19.0 MB,
`wonder56/captcha-crnn-solver` 27.2 MB, `canhday/viotp-captcha-onnx` 57.5 MB) or 300 MB-1.2 GB
TrOCR/LLM stacks (`IamMinus/ocr-captcha-onnx` 1.2 GB). `captchaboy/8kun-fast-captcha` and
`mpak1913/ocr_ikd_captcha_solver` ship no weights. Srmap's student CNN is 1,322,529 B but
uppercase-only. The actionable lever is therefore the **runtime**, about half the compressed transfer.

## Where the bytes actually are (verified, local)

`portal-alnum.onnx`: input `input1` `[1,1,64,W]` dynamic width, output `[seq,1,63]`, 292
nodes, charset 63 = CTC blank + `a-z A-Z 0-9` (genuinely mixed case). Initializers total
5,201,612 of 5,230,935 bytes; **two `_quantized` LSTM matrices of 2,097,152 B each =
4,194,304 B, 80% of the file.** The graph is already dynamically quantized via ORT fused
ops: `DynamicQuantizeLSTM`, `ConvInteger`, `MatMulInteger`, `DynamicQuantizeLinear`.

Consequences: shrinking the model means a CNN-only head, i.e. retraining, out of scope; any
custom runtime must implement those four fused ops; and the graph is not directly
convertible to TF.js without an fp32 source.

## Top 3, concrete

### 1. ORT Web custom minimal build — biggest safe lever  *(mechanism verified, size inferred)*

ORT documents `--minimal_build` for web as generating "smaller artifacts and also less
runtime memory" and requires an ORT-format model; `create_reduced_build_config.py` emits the
reduced operator config for `--include_ops_by_config`, with
`--enable_reduced_operator_type_support`. Verified from ORT's build docs. **The resulting
wasm size is not published** — treat any "1-3 MB" figure as inferred until built.
Feasibility checks for the parent: emscripten toolchain, keeping the four fused quantized
ops, and confirming `DynamicQuantizeLSTM` survives a reduced web build. Predictions and operator support still need verification after conversion.

### 2. TensorFlow.js WASM runtime — ~12x smaller, needs a new export  *(sizes verified, conversion inferred)*

Downloaded from jsDelivr and gzipped locally: `tfjs-backend-wasm@4.22.0`
`tfjs-backend-wasm-threaded-simd.wasm` 435,643 raw / 140,192 gz, `tf-backend-wasm.js`
484,314 / 63,589, `tfjs-core@4.22.0` `tf-core.min.js` 294,062 / 82,878. Runtime total
**1,214,019 raw / 286,659 gz** vs ORT 14,036,259 / 3,595,158 — ~11.6x raw, ~12.5x gz.
Apache-2.0. A non-threaded variant exists at 424,594 B; threaded-simd needs SharedArrayBuffer
(COOP/COEP headers). Blocker: our fused quantized ops cannot be converted, so this needs a
re-exported model — retraining-adjacent.

### 3. Pretrained drop-in — none; nearest is the MIT Luogu model  *(verified)*

`langningchen/luogu-captcha-model`, MIT (HF API), sizes verified by download/API: int8 ONNX
1,786,448, fp16 3,299,638, fp32 6,524,026, TF.js bin 1,626,497, Keras h5 6,714,232. The int8
ONNX is a real protobuf: input `captcha` `[N,35,90,3]` NHWC, output `characters` `[N,4,35]`,
463 nodes, QDQ ops present. **Not a drop-in**: 35 classes `a-z 1-9` (no uppercase, no `0`),
fixed 4 chars, 35x90 NHWC, versus our 63-class mixed-case 6-char 175x46 problem. Its 94.3%
is self-reported, not reproduced here. Value: the only verified <2 MB CAPTCHA model with a
usable license, useful as an architecture/quantization template.

## Cold-start arithmetic

7.26 MB gzip at 5 / 10 / 20 Mbps is 11.6 / 5.8 / 2.9 s. A 10 s wait could be network-bound, but current phone telemetry does not establish cache state or separate network from compilation. Expanded telemetry is needed to distinguish them.

## References and limits

Sources: local `public/ocr/` bytes plus `gzip -9`; jsDelivr listings for `onnxruntime-web`
1.17/1.20/1.29, `tfjs-backend-wasm` 4.22.0, `tfjs-core` 4.22.0, `tfjs-tflite`
0.0.1-alpha.10 (`tflite_web_api_cc_simd.wasm` 3,689,633, deprecated); ORT docs
`build/web.html`, `reduced-operator-config-file.html`; HF API for
`langningchen/luogu-captcha-model`; npm registry.

Limits: no phone cold-start was reproduced — the >=10 s is the user's, and warm figures
(init 2,061 ms, inference 127 ms) do not speak to it. Nothing was trained, re-quantized, or
built. Option 1's size is unknown until built; option 2 needs an absent fp32 source; option
3 is not drop-in.
