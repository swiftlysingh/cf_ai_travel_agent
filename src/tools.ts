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
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  // Weather tool now executes automatically, so no execution needed here
};
