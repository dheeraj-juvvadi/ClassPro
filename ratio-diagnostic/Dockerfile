FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ratio-diagnostic/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY ratio-diagnostic /app/ratio-diagnostic
COPY portal-python/ocr.py /app/portal-python/ocr.py
COPY portal-python/model /app/portal-python/model
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OCR_ASSET_DIR=/app/portal-python/model
USER 65534:65534
WORKDIR /app/ratio-diagnostic
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --no-access-log --workers 1"]
