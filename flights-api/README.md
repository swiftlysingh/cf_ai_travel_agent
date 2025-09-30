# Flights API Server

Python HTTP server that wraps the `flights-cli` tool for use with the travel agent.

## Why This Server?

The travel agent runs in a Cloudflare Workers environment, which doesn't support executing shell commands or Python scripts directly. This separate API server allows the agent to search for flights by making HTTP requests to this service, which then executes the `flights-cli` tool.

## Quick Start

### 1. Setup (First Time Only)

From the project root:
```bash
cd flights-api
./setup.sh
cd ..
```

Or if you're already in the `flights-api` folder:
```bash
chmod +x setup.sh start.sh  # Make scripts executable (first time only)
./setup.sh
```

This will:
- Create a Python virtual environment (isolated from system Python)
- Install `flights-cli` and all dependencies
- Set up everything needed to run the server

### 2. Start the Server

From the project root:
```bash
./flights-api/start.sh
```

Or from within the `flights-api` folder:
```bash
./start.sh
```

Or manually:
```bash
source venv/bin/activate
python server.py
```

The server will start on `http://localhost:8787`

### 3. Use the Travel Agent

With the server running, start your travel agent in another terminal:
```bash
npm run dev
```

Then ask it to search for flights:
- "Find me flights from SFO to LAX on March 1, 2026"
- "Search for round-trip business class flights from JFK to London"

## What It Does

This server accepts HTTP POST requests with flight search parameters and executes the `flights-cli` tool to search for flights on Google Flights.

### API Endpoint

**URL:** `POST http://localhost:8787/api/flights`

**Example Request:**
```bash
curl -X POST http://localhost:8787/api/flights \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {"date": "2026-03-01", "from": "SFO", "to": "LAX"}
    ],
    "cabinClass": "economy",
    "adults": 1
  }'
```

## Configuration

### Change Port

Edit `server.py` and modify:
```python
port = 8787  # Change to your desired port
```

Then update the travel agent's `.dev.vars`:
```bash
FLIGHTS_API_URL=http://localhost:YOUR_PORT/api/flights
```

## Troubleshooting

### "Command not found: flights-cli"

Re-run the setup:
```bash
./setup.sh
```

### Port Already in Use

Either stop the process using port 8787, or change the port in `server.py`.

### Permission Denied

Make scripts executable:
```bash
chmod +x setup.sh start.sh
```

## File Structure

```
flights-api/
├── server.py          # Main HTTP server
├── requirements.txt   # Python dependencies
├── setup.sh          # Setup script
├── start.sh          # Convenience start script
├── venv/             # Virtual environment (created by setup)
└── README.md         # This file
```

## Development

To make changes to the server:

1. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```

2. Edit `server.py`

3. Restart the server:
   ```bash
   python server.py
   ```

## Production Deployment

For production use, you'll want to deploy this API server to a cloud platform. Here are some options:

### Option 1: Deploy to Render / Railway

These platforms have simple Python deployment:

1. Push your code to GitHub
2. Connect your repo to Render/Railway
3. Set start command: `python server.py`
4. Set `FLIGHTS_API_URL` in your agent's environment variables

### Option 2: Docker

Create a `Dockerfile`:
```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY server.py .
EXPOSE 8787
CMD ["python", "server.py"]
```

Build and run:
```bash
docker build -t flights-api .
docker run -p 8787:8787 flights-api
```

### Option 3: Google Cloud Run / AWS Lambda

Deploy as a serverless function for auto-scaling.

### Security for Production

⚠️ **Important:** Add these for production:
1. **Authentication** - Prevent unauthorized access
2. **Rate limiting** - Prevent abuse
3. **HTTPS** - Secure communication
4. **Input validation** - Sanitize all parameters
5. **Monitoring** - Track usage and errors

## Example Queries

Once everything is running, your travel agent can handle queries like:

**Simple one-way:**
> "Find flights from New York to Los Angeles tomorrow"

**Round-trip with details:**
> "Search for round-trip business class flights from SFO to Tokyo, leaving Jan 15 and returning Jan 25, with max 1 stop"

**Multi-city:**
> "I need multi-city flights: Delhi to San Francisco on Jan 1, San Francisco to New York on Jan 5, and New York back to Delhi on Jan 10"

**With passengers:**
> "Find economy flights from LAX to Hawaii for 2 adults and 2 children on March 1"
