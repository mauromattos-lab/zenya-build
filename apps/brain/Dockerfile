FROM node:22-alpine

WORKDIR /app
COPY apps/brain/package.json ./package.json
COPY apps/brain/src ./src

ENV NODE_ENV=production
ENV BRAIN_HOST=0.0.0.0
ENV BRAIN_PORT=3101

EXPOSE 3101
CMD ["node", "src/server.mjs"]
