FROM python:3.11-slim

# Install system dependencies for GDAL, Rasterio, and localtileserver
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    gdal-bin \
    libgdal-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL environment variables so pip compiles rasterio correctly
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files and database fallbacks
COPY server.py .

# Create folders for temporary data processing
RUN mkdir -p temp uploads

EXPOSE 8000

CMD ["python", "server.py"]
