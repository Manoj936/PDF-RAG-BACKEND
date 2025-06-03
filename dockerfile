FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Copy and give permission to the entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# This is your entry point — runs both server and worker
CMD ["./entrypoint.sh"]
