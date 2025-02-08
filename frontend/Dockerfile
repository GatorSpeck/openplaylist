FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

ENV NODE_ENV=production
ENV VITE_HOST=0.0.0.0
ENV VITE_PORT=8080

# Install serve to run the built application
RUN npm install -g serve

# Command to run the application
CMD npm run dev -- --host ${VITE_HOST} --port ${VITE_PORT}