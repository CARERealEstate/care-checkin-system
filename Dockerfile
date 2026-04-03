FROM node:20-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
    fonts-ipafont-gothic \
      fonts-wqy-zenhei \
        fonts-thai-tlwg \
          fonts-kacst \
            fonts-freefont-ttf \
              libxss1 \
                --no-install-recommends && \
                  rm -rf /var/lib/apt/lists/*

                  # Set Puppeteer to use installed Chromium
                  ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
                  ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

                  WORKDIR /app

                  # Copy package files
                  COPY package*.json ./

                  # Install dependencies
                  RUN npm install --omit=dev

                  # Copy application
                  COPY . .

                  # Create data directory
                  RUN mkdir -p /data/temp /data/logs /data/placements

                  # Expose port
                  EXPOSE 3000

                  # Health check
                  HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
                    CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

                    CMD ["node", "src/server.js"]
