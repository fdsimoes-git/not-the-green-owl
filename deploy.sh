#!/bin/bash

# Not The Green Owl Deployment Script
# Run this script after cloning the repository

set -e

echo "Setting up Not The Green Owl..."

# Create necessary directories
echo "Creating directories..."
mkdir -p ssl audio img

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Check for required files
echo "Checking configuration..."

if [ ! -f ".env" ]; then
    echo "Note: No .env file found."
    echo "  Production: secrets should be set as system environment variables (e.g. via systemd)."
    echo "  Local dev:  cp .env.example .env  and fill in your values."
fi

# Generate SSL certificates if they don't exist
if [ ! -f "ssl/server.key" ] || [ ! -f "ssl/server.crt" ]; then
    echo "Generating SSL certificates..."
    npm run ssl
fi

echo "Deployment setup complete!"
echo ""
echo "Next steps:"
if [ -f ".env" ]; then
    echo "1. Edit .env with your actual configuration values"
else
    echo "1. Set required env vars (ENCRYPTION_KEY, SESSION_SECRET) via systemd or .env"
fi
echo "2. Set up the database: psql -f db/schema.sql"
echo "3. Seed the database: node db/seed.js"
echo "4. Start the server: npm run start:prod"
echo ""
echo "Access your application at:"
echo "   https://localhost:443"
