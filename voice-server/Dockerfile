# Self-hosted voice server ("My own voice") — CPU only, works on x86 and on
# Oracle's Ampere (ARM) VMs. The model (~2 GB) downloads on first start into
# the /data volume, together with your voices.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libsndfile1 build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt \
 && apt-get purge -y build-essential && apt-get autoremove -y

COPY app.py .

ENV DATA_DIR=/data \
    HF_HOME=/data/hf \
    PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8000

# One worker: the model is loaded once and handles one request at a time.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
