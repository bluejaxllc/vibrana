FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3006
ENV PORT=3006
CMD ["node", "server.js"]
