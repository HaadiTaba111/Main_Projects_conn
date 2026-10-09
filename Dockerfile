# Dockerfile for Hugging Face Spaces & Koyeb (Node.js + Python All-in-One)
FROM node:20-slim

# Install Python and dependencies
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application files
COPY package*.json ./
COPY . .

# Install Python requirements
RUN pip3 install --no-cache-dir --break-system-packages flask pillow arabic-reshaper python-bidi python-dotenv

# Default port for Hugging Face Spaces (7860) and standard cloud (8080)
ENV PORT=7860
EXPOSE 7860

# Start Universal Master Hub
CMD ["node", "universal_hub.js"]
