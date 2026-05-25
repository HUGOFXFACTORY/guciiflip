FROM node:18-slim

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies fresh (ignores any committed node_modules)
RUN npm ci --include=optional

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 3000

CMD ["npm", "start"]
