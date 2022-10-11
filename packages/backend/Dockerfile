FROM node:14 as packages
ARG NPM_TOKEN
WORKDIR /app
RUN npm i npm@7 -g
COPY package*.json ./
RUN npm ci --only=production

FROM node:14
WORKDIR /app
COPY --from=packages /app /app
COPY . .
EXPOSE 3044
ENTRYPOINT [ "node", "dist/server/main.js" ]