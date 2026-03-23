FROM python:3.11-slim

WORKDIR /app

COPY requirements-cloud.txt ./
RUN pip install --no-cache-dir -r requirements-cloud.txt

COPY . .

ENV PORT=5001
EXPOSE $PORT

CMD gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 120 cloud_app:app
