FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY archive-org-downloader.py ./

COPY web/package.json web/package-lock.json ./web/
WORKDIR /app/web
RUN npm ci
COPY web/ ./
RUN npm run build

ENV NODE_ENV=production
ENV PYTHON_BIN=python3
EXPOSE 3000
CMD ["npm", "start"]
