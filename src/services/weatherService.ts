import * as Location from 'expo-location';

export interface WeatherSnapshot {
  tempC: number;
  condition: string; // OpenWeather main condition, e.g. "Rain", "Clear"
  isOutdoorFriendly: boolean;
}

const RAINY_CONDITIONS = new Set(['Rain', 'Drizzle', 'Thunderstorm', 'Snow']);

/**
 * Requests foreground location permission and fetches current weather from OpenWeatherMap.
 * Returns null if permission is denied or the API key isn't configured — callers should
 * fall back to a generic (non-weather-aware) suggestion in that case.
 */
export async function getCurrentWeather(): Promise<WeatherSnapshot | null> {
  const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  const { latitude, longitude } = position.coords;

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  const condition: string = data?.weather?.[0]?.main ?? 'Clear';

  return {
    tempC: Math.round(data?.main?.temp ?? 0),
    condition,
    isOutdoorFriendly: !RAINY_CONDITIONS.has(condition),
  };
}

export function weatherTip(weather: WeatherSnapshot): string {
  if (!weather.isOutdoorFriendly) {
    return `It's ${weather.condition.toLowerCase()} outside (${weather.tempC}°C) — consider an indoor alternative for outdoor habits today.`;
  }
  if (weather.tempC >= 30) {
    return `It's hot today (${weather.tempC}°C) — stay hydrated if you're heading outdoors.`;
  }
  return `${weather.condition} and ${weather.tempC}°C — good conditions for outdoor habits today.`;
}
