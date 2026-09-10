FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --no-frozen-lockfile

COPY apps/api apps/api
COPY database database
RUN pnpm --filter @tuku/pay-api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
