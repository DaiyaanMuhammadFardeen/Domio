FROM node:22.11-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY ../../tsconfig.base.json ./tsconfig.base.json
RUN npm install --no-audit --no-fund pnpm@9.12.3 && pnpm install --prod=false
RUN pnpm --filter @domio/live-analytics build
EXPOSE 3070
CMD ["node", "dist/main.js"]