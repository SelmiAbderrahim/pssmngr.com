# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.19.0
ARG PNPM_VERSION=9.12.0

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@${PNPM_VERSION}

FROM base AS deps
WORKDIR /app
COPY client/package.json client/pnpm-lock.yaml ./
RUN --mount=type=cache,id=client-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

WORKDIR /crypto
COPY crypto/package.json crypto/pnpm-lock.yaml ./
RUN --mount=type=cache,id=crypto-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /crypto/node_modules /crypto/node_modules
COPY crypto /crypto
COPY client ./

ARG VITE_API_URL=
ARG VITE_SITE_URL
ARG VITE_GA_MEASUREMENT_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
RUN pnpm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx/client.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM base AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /crypto/node_modules /crypto/node_modules
COPY crypto /crypto
COPY client ./
EXPOSE 5173
CMD ["pnpm", "run", "dev"]
