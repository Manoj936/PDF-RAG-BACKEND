# Use official Node.js LTS image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy source files
COPY . .

# Create upload folder if needed
RUN mkdir -p upload

# Expose app port
EXPOSE 8080

# Run both server and worker in background
CMD bash -c "node server.js & node worker.js & wait"
