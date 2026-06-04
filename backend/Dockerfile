FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Hugging Face runs on port 7860 by default
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["npm", "start"]
