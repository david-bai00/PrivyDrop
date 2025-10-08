# Multi-stage build — build stage
FROM node:18-alpine AS builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV http_proxy ${HTTP_PROXY} \
    https_proxy ${HTTPS_PROXY} \
    no_proxy ${NO_PROXY}

WORKDIR /app
# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm --no-audit --no-fund

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Declare and use build-time public vars after deps installation to avoid cache invalidation when only API/TURN change
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TURN_HOST
ARG NEXT_PUBLIC_TURN_USERNAME
ARG NEXT_PUBLIC_TURN_PASSWORD

# Inject public env vars during frontend build (for client direct access to backend and TURN)
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_TURN_HOST=${NEXT_PUBLIC_TURN_HOST}
ENV NEXT_PUBLIC_TURN_USERNAME=${NEXT_PUBLIC_TURN_USERNAME}
ENV NEXT_PUBLIC_TURN_PASSWORD=${NEXT_PUBLIC_TURN_PASSWORD}

# Set environment variables
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Build the app
RUN pnpm build

# Production stage
FROM node:18-alpine AS runner

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY health-check.js ./

# Set environment variables
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3002
ENV HOSTNAME "0.0.0.0"

USER nextjs

# Expose ports
EXPOSE 3002

# Use a Node.js script for health checks (instead of curl)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node health-check.js

# Start the app
CMD ["node", "server.js"]

# Keep public env vars at runtime (optional; helps SSR read them)
# Re-declare ARGs in this stage so they can expand into ENV
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TURN_HOST
ARG NEXT_PUBLIC_TURN_USERNAME
ARG NEXT_PUBLIC_TURN_PASSWORD
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_TURN_HOST=${NEXT_PUBLIC_TURN_HOST}
ENV NEXT_PUBLIC_TURN_USERNAME=${NEXT_PUBLIC_TURN_USERNAME}
ENV NEXT_PUBLIC_TURN_PASSWORD=${NEXT_PUBLIC_TURN_PASSWORD}
