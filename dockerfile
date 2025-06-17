# Use official Node.js LTS base image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy only package.json and package-lock.json first for efficient layer caching
COPY package*.json ./

# Install only production dependencies (skip devDependencies)
RUN npm install --omit=dev

# Copy all source files
COPY . .

# Create upload directory with correct permissions
RUN mkdir -p upload && chown -R node:node /app

# Use non-root user for security (optional)
USER node

# Expose the port your server listens on
EXPOSE 8080

# Start the app (only the server)
CMD ["node", "server.js"]
