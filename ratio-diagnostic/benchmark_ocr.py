"""Real local model inference on synthetic images; no SRM or credentials."""
import concurrent.futures
import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import resource
import time
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('anon_ocr', Path(__file__).resolve().parent.parent / 'portal-python/ocr.py')
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)
image = Image.new('RGB', (175, 45), 'white')
ImageDraw.Draw(image).text((24, 15), 'Ab3Cd7', fill='black')
buffer = io.BytesIO()
image.save(buffer, format='PNG')
sample = buffer.getvalue()


def solve(submitted):
    start = time.perf_counter()
    try:
        ocr.solve(sample)
        outcome = 'decoded'
    except ValueError:
        # Synthetic typography need not match the model's training images.
        # Inference still executes; this is not an OCR accuracy measurement.
        outcome = 'uncertain'
    return {'queue_ms': (start - submitted) * 1000,
            'total_ms': (time.perf_counter() - submitted) * 1000, 'outcome': outcome}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=float, default=10)
    parser.add_argument('--burst', type=int, default=12)
    args = parser.parse_args()
    cold = solve(time.perf_counter())
    print(json.dumps({'cold_ms': round(cold['total_ms'], 2), 'scope': 'synthetic image; inference only'}), flush=True)
    for workers in [1, 2, 4, 6]:
        results = []
        begin = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            while time.perf_counter() - begin < args.seconds:
                submitted = time.perf_counter()
                futures = [executor.submit(solve, submitted) for _ in range(args.burst)]
                results.extend(f.result() for f in futures)
        elapsed = time.perf_counter() - begin
        latency = sorted(r['total_ms'] for r in results)
        print(json.dumps({'workers': workers, 'burst': args.burst, 'samples': len(results),
            'elapsed_seconds': round(elapsed, 2),
            'median_ms': round(latency[len(latency)//2], 2),
            'p95_ms': round(latency[int(len(latency)*.95)-1], 2),
            'max_ms': round(max(latency), 2), 'inferences_per_second': round(len(results)/elapsed, 2),
            'peak_rss_kib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}), flush=True)
