FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY context ./context
ENV NODE_ENV=production DATA_DIR=/app/data PORT=8080
RUN mkdir -p /app/data && chmod -R 777 /app/data
VOLUME /app/data
EXPOSE 8080
CMD ["sh", "-c", "if [ -n \"$INSTANCES\" ]; then exec node src/multi.js; else exec node src/index.js; fi"]
