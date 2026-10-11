FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY lib ./lib
COPY services/payments ./services/payments
RUN npm ci --omit=dev --workspace=services/payments --include-workspace-root
ENV NODE_ENV=production
CMD ["node", "services/payments/src/server.js"]
