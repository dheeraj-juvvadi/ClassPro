# StoreVia/Srmap-Captcha-Solver capacity review

Read-only inspection of `StoreVia/Srmap-Captcha-Solver` @ `fcaa2f0cff4df3ac9e492ab6165a104f6fe128c3` (`main`, pushed 2026-08-17), https://github.com/StoreVia/Srmap-Captcha-Solver. Measurements from `portal-app/.venv-ocr` (Python 3.12.13, onnxruntime 1.30.0, macOS arm64), single thread, CPU EP. No credentials, no live login.

## What it is

OCR inference only — image in, text out. **No login, cookie, session, credential, or HTTP-client code**; nothing here addresses spin-down or session reuse. 7,526 blobs, 7,497 CAPTCHAs (5,000 student / 2,497 parent). No license (`license: null`), so redistributing the weights is legally unclear. `parentPortalOnly/api.py` is absent (404); `studentPortalOnly/api.py` loads a `.pth` path not in the repo.

## Bytes

| Artifact | Path | Bytes |
|---|---|---|
| Hybrid CRNN ONNX | `hybrid/captcha_crnn.onnx` | 21,259,303 |
| Hybrid CRNN Torch | `hybrid/captcha_crnn.pth` | 21,267,877 |
| Student ONNX | `studentPortalOnly/models/captcha_model.onnx` | 1,322,529 |
| Student TFLite fp32 | `studentPortalOnly/models/captcha_model_float32.tflite` | 1,325,232 |
| Student TFLite fp16 | `studentPortalOnly/models/captcha_model_float16.tflite` | 666,804 |
| Parent ONNX | `parentPortalOnly/captcha_model.onnx` | 1,334,934 |

SHA-256: student `548940f9bddf25d9c41acc9fd2ae743106f53cd25524a62ab95060b37d9808e2`, hybrid `a429388f5ec6595aff039d44659ab8ac3b8edaddd9b337d78f8c70ebc3a283c5`. Two families exist: a 21 MB CRNN and a ~1.3 MB per-portal CNN the README never mentions.

## Tensors and charset

| | Hybrid CRNN | Student CNN |
|---|---|---|
| Input | `input` `[batch,1,32,120]` f32 | `input` `[batch,1,25,120]` f32 |
| Output | `output` `[30,batch,37]` | `output` `[batch,5,37]` |
| Decoding | greedy CTC | argmax per slot, strip `_` |

Both inputs are fixed-shape. Hybrid vocab is 36 chars `0-9A-Z` plus a CTC blank at index 0; the student head is a fixed 5 slots (`A-Z`, `0-9`, `_` pad). No lowercase anywhere: `dataset/student/labels.csv` has 5,000 rows, lengths `{5:4506, 4:442, 3:49, 2:3}`, uppercase and digits only, and excludes the letter `I`.

Operators — student: `Conv, MaxPool, AveragePool, Relu, Gemm, Reshape, Shape, Gather, Concat, Constant, Unsqueeze` (Conv 1→32→64→128, AdaptiveAvgPool(1,10), Linear 1280→185). Hybrid adds `LSTM, MatMul, Erf, Pow, ReduceMean, Sub, Neg, Slice, Transpose` (CNN, GELU/LayerNorm decomposition, BiLSTM, CTC). Both are float32 with no quantization nodes.

## Runtime (warm, 1 thread)

| Model | Load | First run | Steady median | Process RSS |
|---|---|---|---|---|
| Student ONNX 1.32 MB | 34.7 ms | 4.1 ms | 1.67 ms | ~52 MB |
| Hybrid CRNN 21.3 MB | 31.0 ms | 19.7 ms | 13.73 ms | ~89 MB |

An own-sample decode returned `X64`, so the checkpoint is live. RSS is whole-process including numpy and onnxruntime.

## Queue

`hybrid/api.py` only: `asyncio.Queue(64)`, one worker coroutine, one session, `workers=1`, a 10 s result timeout, `503 busy` when full and `504` on timeout. Strictly serialized, no batching or cache. `studentPortalOnly/api.py` has none. Neither holds portal state, so the queue dies with the process.

## KTR 175x46 mixed-case

Constraint from the main task (175x46, mixed case), matching the 62-character charset in `portal-app/scripts/captcha-worker.py`; not re-measured here (no KTR samples in the workspace).

1. **Alphabet.** 37 classes; the 7,497 training labels contain zero lowercase and exclude `I`. Lowercase is unrepresentable by construction.
2. **Geometry.** `crop_captcha` cuts to `(0,0,120,25)` when w>120 or h>25: for 175x46 that keeps the left 120px (69%, ~1-2 whole glyphs lost) and the top 25 of 46 rows, then resizes to fixed 32x120.
3. **Probe.** `Ab3Xy` rendered at 175x46 through the exact pipeline decoded `Z1` — not an accuracy benchmark, only the path and the alphabet ceiling.

Not drop-in; reuse needs retraining at KTR geometry with the license unresolved.

## ddddocr reality (corrects the previous version)

- Installed `ddddocr==1.5.6` loads **`common_old.onnx`, 13,606,051 bytes** (verified via `engine._DdddOcr__graph_path`). The 54,088,400-byte `common.onnx` sits on disk but is **not** loaded; the previous text was wrong.
- Input `input1` `[1,1,64,image_width]`, dynamic width; charset length 8,210.
- Already quantized: `DynamicQuantizeLinear` 22, `ConvInteger` 21, `MatMulInteger` 1, `DynamicQuantizeLSTM` 1, no float `Conv`/`MatMul`/`LSTM`. `set_ranges` narrows decoding only.
- Trimmed `/tmp/classpro-small-ocr/portal-alnum.onnx`: **5,230,935 bytes**, gzip 3,664,732 (`-9`), sha256 `c4853f66f04018930d33333dbf4506519d1d3173a7bf10503b35cfe076142f09`; input `[1,1,64,image_width]`, output `['sequence',1,63]` (62 alphanumerics + blank), same quantized ops. Measured at width 180: 5.32 ms median, 5.59 ms p95, ~69 MB RSS, consistent with the reported 7 ms / 72 MB.

## Render Free (official sources, fetched 2026-09-14)

The two official pages disagree on the free CPU share; neither figure is extrapolated here.

- `render.com/docs/free` glossary: "**`free`**: 0.1 CPU / 512 MB RAM".
- `render.com/pricing` table: "Free (limitations apply) | $0/month | 512 MB RAM | free | **Less than 1 CPU**".

512 MB RAM is consistent across both. The docs also state a Free web service "spins down" after 15 minutes without inbound traffic, losing local filesystem changes. Free-tier throughput is **unknown** and must be measured on the real instance, not inferred from desktop timings or either CPU figure.

## Bottom line

Neither StoreVia model handles KTR mixed-case 175x46, so neither displaces ddddocr. Reusable is the pattern, not the weights: a bounded single-worker queue in front of one long-lived session with explicit busy/timeout responses. ddddocr's default graph is already quantized (13.6 MB; trimmed 5.23 MB), so model size is not the memory constraint. Free-tier capacity remains unmeasured.
