FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js index.html app.js styles.css config.js README.md DEPLOY.md ./

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.js"]
