FROM node:20-slim

# Install Python, g++, and Java
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    g++ \
    default-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.js .

EXPOSE 8080
CMD ["node", "server.js"]
