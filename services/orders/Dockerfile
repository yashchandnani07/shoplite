FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY lib ./lib
COPY services/orders ./services/orders
RUN npm ci --omit=dev --workspace=services/orders --include-workspace-root
ENV NODE_ENV=production
CMD ["node", "services/orders/src/server.js"]
