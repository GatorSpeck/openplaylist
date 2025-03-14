FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# prod stage
FROM python:3.11-slim
WORKDIR /app

COPY --from=builder /app/wheels /wheels
COPY . .

RUN pip install --no-cache /wheels/*

CMD ["python", "main.py"]