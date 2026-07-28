FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 9000
CMD ["node","server.js"]
