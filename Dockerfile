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

# Create folders for temporary data processing
# chmod 777 is required for OpenShift: it runs containers as a random non-root UID,
# so the dirs must be world-writable at build time.
RUN mkdir -p temp uploads && chmod -R 777 temp uploads

EXPOSE 8000

CMD ["python", "server.py"]
