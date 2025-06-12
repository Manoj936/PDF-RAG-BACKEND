# Use official Node.js LTS image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy all source files (excluding those in .dockerignore)
COPY . .

# Ensure upload directory exists (if needed by your app)
RUN mkdir -p upload

# Copy and give execution permission to the entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Expose app port (adjust if needed)
EXPOSE 8080

# Start both server and worker
CMD ["./entrypoint.sh"]
