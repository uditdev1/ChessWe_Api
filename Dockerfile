# Stage 2: Final image
FROM node:18

# Set working dir
WORKDIR /app

# Copy backend
COPY ./ ./
WORKDIR /app
RUN npm install

# Expose backend port
EXPOSE 8080

CMD ["npm", "run", "start"]