FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Package files
COPY package*.json ./

# Install all dependencies (dev included for nodemon in dev mode)
RUN npm ci && npm cache clean --force

# Copy application files
COPY . .

# Create required directories
RUN mkdir -p logs uploads

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]
