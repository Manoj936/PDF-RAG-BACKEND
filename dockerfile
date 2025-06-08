# Use official Node.js LTS image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy all source files
COPY . .

# Ensure upload directory exists (useful if your app assumes it)
RUN mkdir -p upload

# Copy and give execution permission to the entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Expose port (if your app runs on 3000 or other)
EXPOSE 3000

# Start server and worker
CMD ["./entrypoint.sh"]
