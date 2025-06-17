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

# Expose your app port
EXPOSE 8080

# Run both server and worker
CMD bash -c "node server.js"
