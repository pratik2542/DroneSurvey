FROM python:3.11-slim

# Install lightweight runtime libraries required by pre-compiled wheels (like rasterio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install (pip will use pre-compiled wheels)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY server.py .

# Set HOME to /app so gdown (and other tools) write their cache inside /app
# instead of /.cache which doesn't exist on OpenShift's non-root containers.
ENV HOME=/app

# Create folders for temporary data processing and gdown cache
# chmod 777 is required for OpenShift: it runs containers as a random non-root UID,
# so the dirs must be world-writable at build time.
RUN mkdir -p temp uploads .cache/gdown && chmod -R 777 temp uploads .cache/gdown

EXPOSE 8000

CMD ["python", "server.py"]
