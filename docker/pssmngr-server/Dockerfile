# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.19.0
ARG PNPM_VERSION=9.12.0

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@${PNPM_VERSION}

FROM base AS deps
WORKDIR /workspace
COPY pssmngr-server/package.json pssmngr-server/pnpm-lock.yaml pssmngr-server/pnpm-workspace.yaml ./
COPY pssmngr-server/apps/pssmngr/package.json apps/pssmngr/package.json
COPY pssmngr-server/packages/server/package.json packages/server/package.json
RUN --mount=type=cache,id=server-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /workspace
COPY pssmngr-server ./
ENV NODE_ENV=production
RUN DATABASE_URL=postgresql://build@127.0.0.1:1/build \
    BETTER_AUTH_SECRET=build-only-placeholder-with-at-least-32-characters \
    ENCRYPTION_KEY=build-only-placeholder-with-at-least-32-characters \
    pnpm --filter @pssmngr/server run build \
    && pnpm --filter pssmngr-app run build
RUN npm_config_ignore_scripts=true pnpm --filter pssmngr-app --prod deploy /opt/pssmngr
RUN cp -R apps/pssmngr/.next /opt/pssmngr/.next \
    && cp -R apps/pssmngr/dist /opt/pssmngr/dist

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /opt/pssmngr/ ./
COPY --chown=node:node docker/pssmngr-server/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh \
    && mkdir -p /app/data-exports /app/.next/cache \
    && chown -R node:node /app/data-exports /app/.next/cache

USER node
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["pnpm", "start"]
