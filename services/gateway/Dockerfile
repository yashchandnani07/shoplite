FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY lib ./lib
COPY services/gateway ./services/gateway
RUN npm ci --omit=dev --workspace=services/gateway --include-workspace-root
ENV NODE_ENV=production
CMD ["node", "services/gateway/src/server.js"]
