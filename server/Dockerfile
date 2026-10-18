FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg poppler-utils espeak-ng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . ./

ENV PORT=3001 \
    RYB_DATA_DIR=/app/data/projects \
    RYB_TTS_ENGINE=espeak-ng

EXPOSE 3001
CMD ["node", "server.js"]
