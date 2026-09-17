import io
import json
import os
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

_session = None
_init_lock = threading.Lock()


def _load_session(root):
    global _session
    if _session is None:
        with _init_lock:
            if _session is None:
                options = ort.SessionOptions()
                options.intra_op_num_threads = 1
                options.inter_op_num_threads = 1
                options.log_severity_level = 3
                _session = ort.InferenceSession(str(root / "captcha_crnn.onnx"), options,
                                                providers=["CPUExecutionProvider"])
    return _session


@lru_cache(maxsize=2)
def _charset(root):
    vocabulary = json.loads((root / "vocab.json").read_text())
    if vocabulary.get("blank_idx") != 0:
        raise ValueError("Invalid OCR vocabulary")
    return " " + vocabulary["vocab"]


def solve(image_bytes):
    root = Path(os.environ.get("OCR_ASSET_DIR", Path(__file__).parent / "model"))
    session = _load_session(root)
    with Image.open(io.BytesIO(image_bytes)) as source:
        if source.size != (175, 45):
            raise ValueError("Invalid image dimensions")
        image = source.convert("L")
        pixels = ((np.asarray(image, dtype=np.float32) / 255.0 - 0.5) / 0.5)[None, None, :, :]
    logits = session.run(None, {session.get_inputs()[0].name: pixels})[0]
    charset = _charset(root)
    if logits.shape[-1] != len(charset):
        raise ValueError("Invalid OCR output")
    indices = logits.reshape(-1, len(charset)).argmax(axis=1)
    answer, previous = "", -1
    for index in indices:
        if index != 0 and index != previous:
            answer += charset[index]
        previous = index
    if not 4 <= len(answer) <= 8 or not answer.isascii() or not answer.isalnum():
        raise ValueError("Uncertain OCR result")
    return answer
