FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install (pip will use pre-compiled wheels)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY server.py .

# Create folders for temporary data processing
RUN mkdir -p temp uploads

EXPOSE 8000

CMD ["python", "server.py"]
