FROM node:20-alpine
WORKDIR /app
# pg_dump for the in-app backup feature
RUN apk add --no-cache postgresql17-client || apk add --no-cache postgresql-client
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 4000
CMD ["npm", "start"]
