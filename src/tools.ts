/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

/**
 * OpenWeatherMap API response types
 */
interface CurrentWeatherResponse {
  name: string;
  sys: { country: string };
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
  };
  weather: Array<{
    main: string;
    description: string;
  }>;
  wind: { speed: number };
  visibility: number;
}

interface ForecastResponse {
  city: {
    name: string;
    country: string;
  };
  list: Array<{
    dt: number;
    main: {
      temp: number;
      humidity: number;
    };
    weather: Array<{
      description: string;
    }>;
    wind: { speed: number };
  }>;
}

/**
 * Helper function to fetch current weather from OpenWeatherMap
 */
async function getCurrentWeather(city: string, apiKey: string): Promise<string> {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    if (response.status === 404) {
      return `City "${city}" not found. Please check the city name and try again.`;
    }
    throw new Error(`OpenWeatherMap API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as CurrentWeatherResponse;
  
  return `Current weather in ${data.name}, ${data.sys.country}:
- Temperature: ${data.main.temp}°C (feels like ${data.main.feels_like}°C)
- Conditions: ${data.weather[0].main} - ${data.weather[0].description}
- Humidity: ${data.main.humidity}%
- Wind Speed: ${data.wind.speed} m/s
- Pressure: ${data.main.pressure} hPa
- Visibility: ${(data.visibility / 1000).toFixed(1)} km`;
}

/**
 * Helper function to fetch forecast weather from OpenWeatherMap
 */
async function getForecastWeather(city: string, targetDate: string, apiKey: string): Promise<string> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    if (response.status === 404) {
      return `City "${city}" not found. Please check the city name and try again.`;
    }
    throw new Error(`OpenWeatherMap API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json() as ForecastResponse;
  const targetDateTime = new Date(targetDate);
  
  // Validate that the target date is within 5 days
  const now = new Date();
  const maxDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  
  if (targetDateTime < now) {
    return `Cannot get forecast for past dates. The date ${targetDate} is in the past. Use the tool without a date to get current weather.`;
  }
  
  if (targetDateTime > maxDate) {
    return `Cannot get forecast beyond 5 days. The date ${targetDate} is too far in the future. Maximum forecast date is ${maxDate.toISOString().split('T')[0]}.`;
  }
  
  // Find forecasts for the target date
  const targetDateStr = targetDateTime.toISOString().split('T')[0];
  const matchingForecasts = data.list.filter((item) => {
    const forecastDate = new Date(item.dt * 1000).toISOString().split('T')[0];
    return forecastDate === targetDateStr;
  });
  
  if (matchingForecasts.length === 0) {
    return `No forecast data available for ${targetDate} in ${city}. Try a date within the next 5 days.`;
  }
  
  // Format all forecasts for that day
  const forecastsText = matchingForecasts.map((item) => {
    const time = new Date(item.dt * 1000).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    return `  ${time}: ${item.main.temp}°C, ${item.weather[0].description}, Humidity: ${item.main.humidity}%, Wind: ${item.wind.speed} m/s`;
  }).join('\n');
  
  return `Weather forecast for ${data.city.name}, ${data.city.country} on ${targetDate}:
${forecastsText}`;
}

/**
 * Weather information tool that fetches current or forecasted weather
 * Uses OpenWeatherMap API to get real weather data
 */
const getWeatherInformation = tool({
  description: "Get weather information for a city. Can fetch current weather or forecast for future dates (up to 5 days ahead).",
  inputSchema: z.object({ 
    city: z.string().describe("The city name to get weather for"),
    date: z.string().optional().describe("Optional: Future date in YYYY-MM-DD format for forecast (max 5 days ahead). If not provided, returns current weather.")
  }),
  execute: async ({ city, date }) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    
    if (!apiKey) {
      return "Error: OpenWeatherMap API key not configured. Please set OPENWEATHER_API_KEY in .dev.vars";
    }

    try {
      // If date is provided, fetch forecast; otherwise, get current weather
      if (date) {
        return await getForecastWeather(city, date, apiKey);
      } else {
        return await getCurrentWeather(city, apiKey);
      }
    } catch (error) {
      console.error("Error fetching weather:", error);
      return `Error fetching weather data: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "2500";
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

/**
 * Helper function to search for flights using a Python API service
 * Since Cloudflare Workers doesn't support child_process, we call an external Python service
 */
async function searchFlights(params: {
  tripType?: "one-way" | "round-trip" | "multi-city";
  segments: Array<{
    date: string;
    from: string;
    to: string;
    maxStops?: number;
    airlines?: string;
  }>;
  maxStops?: number;
  cabinClass?: "economy" | "premium-economy" | "business" | "first";
  fetchMode?: "common" | "fallback" | "force-fallback" | "local" | "bright-data";
  dataSource?: "html" | "js";
  adults?: number;
  children?: number;
  infantsInSeat?: number;
  infantsOnLap?: number;
  bestOnly?: boolean;
  jsonOutput?: boolean;
  prettyPrint?: boolean;
}): Promise<string> {
  // Get the Python API endpoint from environment variable
  const pythonApiUrl = process.env.FLIGHTS_API_URL || "http://localhost:8787/api/flights";
  
  try {
    const response = await fetch(pythonApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flights API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    // If the API returns structured data, format it nicely
    if (typeof result === "object") {
      return JSON.stringify(result, null, 2);
    }
    
    return String(result);
  } catch (error) {
    console.error("Error calling flights API:", error);
    
    // Provide helpful error message
    if (error instanceof Error && error.message.includes("fetch failed")) {
      throw new Error(
        `Unable to connect to the flights API service at ${pythonApiUrl}. ` +
        `Please ensure the Python API service is running. ` +
        `You can start it by running the flights-api-server.py script. ` +
        `Set FLIGHTS_API_URL environment variable to configure the endpoint.`
      );
    }
    
    throw new Error(`Failed to search flights: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Flight search tool that uses a Python API service wrapping flights-cli
 * Calls an external API endpoint to execute flight searches
 */
const searchFlightsTool = tool({
  description: `Search for flights using Google Flights data. Supports one-way, round-trip, and multi-city searches with various options like cabin class, number of stops, passenger counts, and more.`,
  inputSchema: z.object({
    tripType: z
      .enum(["one-way", "round-trip", "multi-city"])
      .optional()
      .describe("Type of trip. If not specified, will be inferred from segments (2 segments = round-trip, otherwise one-way)"),
    segments: z
      .array(
        z.object({
          date: z.string().describe("Departure date in YYYY-MM-DD format"),
          from: z.string().describe("Origin airport IATA code (e.g., 'JFK', 'LAX')"),
          to: z.string().describe("Destination airport IATA code (e.g., 'LHR', 'SFO')"),
          maxStops: z.number().optional().describe("Maximum stops for this specific segment (overrides global maxStops)"),
          airlines: z.string().optional().describe("Comma-separated airline codes (e.g., 'AA,DL') or alliances (e.g., 'SKYTEAM')")
        })
      )
      .min(1)
      .describe("Flight segments. For round-trip, provide 2 segments. For multi-city, provide 3 or more."),
    maxStops: z.number().optional().describe("Maximum number of stops globally (can be overridden per segment)"),
    cabinClass: z
      .enum(["economy", "premium-economy", "business", "first"])
      .default("economy")
      .describe("Cabin class for the flight"),
    fetchMode: z
      .enum(["common", "fallback", "force-fallback", "local", "bright-data"])
      .default("common")
      .describe("Backend fetch strategy: 'common' for direct HTTP, 'fallback' for fallback to Playwright, etc."),
    dataSource: z
      .enum(["html", "js"])
      .default("html")
      .describe("Data source: 'html' for summaries, 'js' for detailed itinerary data"),
    adults: z.number().min(1).max(9).default(1).describe("Number of adult passengers"),
    children: z.number().min(0).max(8).default(0).describe("Number of child passengers"),
    infantsInSeat: z.number().min(0).default(0).describe("Number of infants in seats"),
    infantsOnLap: z.number().min(0).default(0).describe("Number of infants on lap (must not exceed adults)"),
    bestOnly: z.boolean().default(false).describe("Return only the best flight(s)"),
    jsonOutput: z.boolean().default(true).describe("Output structured JSON"),
    prettyPrint: z.boolean().default(true).describe("Format JSON with indentation (requires jsonOutput to be true)")
  }),
  execute: async (params) => {
    try {
      // Validate total passengers
      const totalPassengers = params.adults + params.children + params.infantsInSeat + params.infantsOnLap;
      if (totalPassengers > 9) {
        return "Error: Total number of passengers cannot exceed 9.";
      }
      
      // Validate infants on lap
      if (params.infantsOnLap > params.adults) {
        return "Error: Number of infants on lap cannot exceed number of adults.";
      }

      return await searchFlights(params);
    } catch (error) {
      console.error("Error in searchFlightsTool:", error);
      return `Error searching for flights: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  searchFlightsTool
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  // Weather tool now executes automatically, so no execution needed here
};
