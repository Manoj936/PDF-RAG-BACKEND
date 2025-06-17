FROM node:18-slim

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the source code
COPY . .

# Ensure upload folder exists
RUN mkdir -p upload && chown -R node:node /app

# Switch to a non-root user
USER node

EXPOSE 8080

CMD ["node", "server.js"]
