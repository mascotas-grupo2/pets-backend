FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production

# No correr como root: el usuario `node` ya viene en la imagen oficial.
RUN chown -R node:node /app
USER node

CMD ["node", "dist/index.js"]
