# Use Node.js as the base image
FROM node:20-slim

# Install system dependencies for Puppeteer and FFmpeg
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxshmfence1 \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create and set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose port (optional for WhatsApp bot, but Railway likes it)
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
