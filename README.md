# 🤖 Travel Agent

A Cloudflare Workers AI agent that builds smarter, cheaper multi-city travel plans.

## Why This Exists

Long, multi-stop trips are notoriously hard to price. Flying A → B → C might be dramatically cheaper than the more obvious B → A → C, and the best route often changes if you shift the dates by a couple of days. This agent runs the permutations for you, checks real flight prices, and layers on weather and activity research so you can plan with confidence.

## Key Capabilities

- ✈️ **Permutation-Aware Flight Search** – Explores every ordering of your city list to surface the lowest total fare.
- 📅 **Flexible Fare Window** – Optional ±5 day sweep around each departure to catch cheaper alternatives.
- 🌤️ **Weather Intelligence** – Uses the OpenWeather API for current conditions and five-day forecasts.
- 🧭 **Destination Discovery** – Firecrawl-powered lookups for local highlights, dining, and must-do experiences.
- 🧾 **Itinerary Summaries** – Generates concise trip plans using OpenAI’s GPT-5 Nano model via the Cloudflare AI Agent framework.
- 🏨 **Hotel Booking (in progress)** – A `bookHotel` tool stub is wired in while we evaluate hotel APIs; suggestions route to a confirmation workflow for now.

## Integrations & Data Sources

| Capability              | Provider / Tool            | Notes |
| ----------------------- | -------------------------- | ----- |
| Flight availability     | `flights-cli` (Google Flights) | Python microservice called from the Worker |
| Activities & experiences| Firecrawl                  | Scrapes curated guides and attractions |
| Weather data            | OpenWeather API            | Current weather + 5-day forecast |
| Language model          | OpenAI `gpt-5-nano`        | Runs through Cloudflare Agents SDK |
| Hotel booking           | _Pending_                  | Evaluating suppliers; tool present but inactive |

## Architecture at a Glance

- **Cloudflare Workers AI Agent (`src/server.ts`)** orchestrates the conversation, tool calls, and streaming responses.
- **Flights API microservice (`flights-api/`)** wraps `flights-cli` to query Google Flights.
- **React chat UI (`src/app.tsx`)** offers confirmation gates (e.g., before booking) and displays streaming output.
- **Tool registry (`src/tools.ts`)** houses flight search, weather lookup, Firecrawl discovery, scheduling helpers, and the in-progress hotel booking hook.

## Prerequisites

- Cloudflare account with Workers + AI access
- OpenAI API key (for GPT-5 Nano)
- Firecrawl API key
- OpenWeather API key

## Environment Configuration

Create `.dev.vars` in the project root:

```env
OPENAI_API_KEY=your_openai_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
FLIGHTS_API_URL=http://localhost:8787/api/flights # optional override
```

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Set up the flights microservice**
   ```bash
   cd flights-api
   ./setup.sh
   ./start.sh
   # service listens on http://localhost:8787 by default
   ```
3. **Return to the project root and launch the Worker dev server**
   ```bash
   cd ..
   npm start
   ```
4. **Deploy to Cloudflare (optional)**
   ```bash
   npm run deploy
   ```

## Using the Agent

Try prompts like:

- "Plan a week visiting Paris, Rome, and Barcelona. I’m flexible ±5 days around 1 June."
- "What’s the weather outlook for Kyoto next Friday, and what should I do while I’m there?"
- "Find the cheapest path from SFO → LAX → JFK with three-day stops in each city."
- "Start a hotel search in Lisbon for 12–15 September; note that I’m still picking a booking provider."

## Roadmap

- 🔄 Finalize and integrate a reliable hotel booking API (the `bookHotel` tool currently collects intent only).
- 📈 Add historical fare trend analysis to surface whether a price is unusually high or low.
- 🧳 Expand packing suggestions based on weather + trip duration.

## Acknowledgements

- [`flights-cli`](https://github.com/AWeirdDev/flights) for the core Google Flights scraping capabilities.
- [Firecrawl](https://www.firecrawl.dev/) for destination discovery and local experience data.
- [OpenWeather](https://openweathermap.org/) for current conditions and forecast data.

