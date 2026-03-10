# STAGE 1: Build the application
FROM node:24-alpine AS metro-builder

# Set a specific working directory to avoid polluting the root
WORKDIR /app

# Copy lock files first to leverage Docker layer caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for building)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the application (usually outputs to /app/build)
RUN npm run build

# Prune dev dependencies to prepare for the production copy
RUN npm prune --production

# STAGE 2: Run the application
FROM node:24-alpine AS metro-runner

# Use the same working directory structure
WORKDIR /app

# COPY production dependencies from builder
# We copy the node_modules folder we just pruned above
COPY --from=metro-builder /app/node_modules ./node_modules
COPY --from=metro-builder /app/package.json ./package.json

# COPY the build output
# Note: verify your svelte.config.js output dir (default is 'build')
COPY --from=metro-builder /app/build ./build

# Expose the port
EXPOSE 8080

ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production

# Security: Run as a non-root user (node image comes with a 'node' user)
USER node

# Start the server
ENTRYPOINT ["node", "build"]