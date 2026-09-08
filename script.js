const searchForm = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const weatherDisplay = document.getElementById('weather-display');
const statusMessage = document.getElementById('status-message');
const themeToggle = document.getElementById('theme-toggle');

const locationName = document.getElementById('location-name');
const currentTemp = document.getElementById('current-temp');
const weatherDesc = document.getElementById('weather-desc');
const windSpeed = document.getElementById('wind-speed');
const humidity = document.getElementById('humidity');
const forecastGrid = document.getElementById('forecast-grid');

let isDarkMode = localStorage.getItem('theme') === 'dark';

if (isDarkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
});

const weatherCodeMap = {
    0: 'Clear sky',
    1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    95: 'Thunderstorm'
};

async function fetchWeather(city) {
    try {
        statusMessage.textContent = 'Fetching location...';
        weatherDisplay.classList.add('hidden');

        // 1. Geocode City Name
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            statusMessage.textContent = 'City not found. Please try another location.';
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        // 2. Fetch Weather Data
        statusMessage.textContent = 'Fetching weather data...';
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();

        // 3. Render Current Weather
        locationName.textContent = `${name}, ${country}`;
        currentTemp.textContent = Math.round(weatherData.current.temperature_2m);
        weatherDesc.textContent = weatherCodeMap[weatherData.current.weather_code] || 'Clear';
        windSpeed.textContent = `${weatherData.current.wind_speed_10m} km/h`;
        humidity.textContent = `${weatherData.current.relative_humidity_2m}%`;

        // 4. Render 3-Day Forecast
        forecastGrid.innerHTML = '';
        for (let i = 1; i <= 3; i++) {
            const date = weatherData.daily.time[i];
            const maxTemp = Math.round(weatherData.daily.temperature_2m_max[i]);
            const minTemp = Math.round(weatherData.daily.temperature_2m_min[i]);

            const forecastCard = document.createElement('div');
            forecastCard.className = 'forecast-card';
            forecastCard.innerHTML = `
                <div class="date">${date}</div>
                <div class="temp">${maxTemp}° / ${minTemp}°</div>
            `;
            forecastGrid.appendChild(forecastCard);
        }

        statusMessage.textContent = '';
        weatherDisplay.classList.remove('hidden');
    } catch (err) {
        statusMessage.textContent = 'Error loading weather data. Please check your connection.';
    }
}

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (city) {
        fetchWeather(city);
    }
});