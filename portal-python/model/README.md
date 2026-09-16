# TinyOCR model

Source: https://github.com/wtfPrethiv/TinyOCR
Revision: `d59c4474cb5371bbe7866b18e6ffa1af0908dbae` (2026-08-23).
MIT license retained in LICENSE.

`captcha_crnn.onnx` is generated from the upstream `best_captcha_crnn.pt`
using its unchanged `scripts/export_onnx.py`. `vocab.json` is copied verbatim.
Checkpoint SHA256: `e9072bf58ad9ccbba4326ae9f2a607e6d64edebd52cd9ac0025e21aea419326e`.
ONNX SHA256: `339c366ccd8356a9707157b3ebd789d2d4f2e430a07db23c6091d7ea4a6636ff`.

Export environment: Python 3.11, torch 2.6.0, onnx 1.17.0,
onnxruntime 1.22.1, numpy 2.2.6, Pillow 11.3.0.
Run `python scripts/export_onnx.py` from a checkout of that revision.
Training dependencies are not installed in the production container.

Validation on 2026-09-16: upstream export parity gate passed. Predictions
matched PyTorch for all 512 bundled test images and random batches 1/2/8/16.
Maximum real-image logit difference: 3.815e-05. Accuracy against bundled
filenames was 494/512; this is not a production login acceptance measurement.

Production uses native 175x45 images, no resizing, PIL grayscale,
normalization `(pixel / 255 - 0.5) / 0.5`, and greedy CTC with blank index 0.
The checkpoint is byte-identical to Ratio-D's pinned copy.
