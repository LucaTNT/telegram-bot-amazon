FROM node:15-alpine AS build

COPY ./app /app

WORKDIR /app

RUN npm i

FROM node:15-alpine

COPY --from=build /app /app

USER node

CMD ["node", "/app/index.js"]
