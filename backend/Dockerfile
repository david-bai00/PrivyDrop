# Build stage
FROM node:18-alpine AS builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV http_proxy ${HTTP_PROXY} \
    https_proxy ${HTTPS_PROXY} \
    no_proxy ${NO_PROXY}

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run stage
FROM node:18-alpine AS runtime

WORKDIR /app

# Copy prebuilt artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY health-check.js ./

# Create user and set permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app

USER backend
EXPOSE 3001

# Use a Node.js script for health checks (instead of curl)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node health-check.js

CMD ["node", "dist/server.js"]
