function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const WEATHER_CODE_TEXT = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

function weatherText(code) {
  return WEATHER_CODE_TEXT[Number(code)] || "Unknown";
}

async function geocodeFirstPlace(query) {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", query);
  geoUrl.searchParams.set("count", "1");
  geoUrl.searchParams.set("language", "en");
  geoUrl.searchParams.set("format", "json");
  const geoResp = await fetch(geoUrl.toString());
  if (!geoResp.ok) throw new Error(`weather_geocode_failed_${geoResp.status}`);
  const geoData = await geoResp.json();
  return Array.isArray(geoData?.results) ? geoData.results[0] : null;
}

export async function fetchCurrentWeather(location) {
  const query = String(location || "").trim();
  if (!query) throw new Error("location_required");

  const candidates = [query];
  if (query.includes(",")) {
    candidates.push(query.split(",")[0].trim());
    candidates.push(query.replace(/,/g, " ").replace(/\s+/g, " ").trim());
  }
  const withoutStateAbbrev = query.replace(/\b[A-Z]{2}\b/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (withoutStateAbbrev && !candidates.includes(withoutStateAbbrev)) candidates.push(withoutStateAbbrev);

  let place = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    place = await geocodeFirstPlace(candidate);
    if (place) break;
  }
  if (!place) throw new Error("weather_location_not_found");

  const lat = toNumber(place.latitude);
  const lon = toNumber(place.longitude);
  if (lat === null || lon === null) throw new Error("weather_location_invalid");

  const wxUrl = new URL("https://api.open-meteo.com/v1/forecast");
  wxUrl.searchParams.set("latitude", String(lat));
  wxUrl.searchParams.set("longitude", String(lon));
  wxUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
  );
  wxUrl.searchParams.set("timezone", "auto");
  const wxResp = await fetch(wxUrl.toString());
  if (!wxResp.ok) throw new Error(`weather_forecast_failed_${wxResp.status}`);
  const wxData = await wxResp.json();
  const current = wxData?.current || {};

  return {
    location: {
      name: place.name || query,
      admin1: place.admin1 || "",
      country: place.country || "",
      latitude: lat,
      longitude: lon
    },
    current: {
      temperatureC: toNumber(current.temperature_2m),
      apparentTemperatureC: toNumber(current.apparent_temperature),
      humidityPct: toNumber(current.relative_humidity_2m),
      precipitationMm: toNumber(current.precipitation),
      windSpeedKmh: toNumber(current.wind_speed_10m),
      weatherCode: toNumber(current.weather_code),
      weatherText: weatherText(current.weather_code),
      observedAt: current.time || ""
    }
  };
}
