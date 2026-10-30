# Analisador de replay: baixa o .aoe2record oficial e resume o corpo com mgz.fast.
FROM python:3.12-slim
WORKDIR /app
COPY apps/analyzer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/analyzer/main.py .
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
