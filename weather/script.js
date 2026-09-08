const themeToggle = document.getElementById('theme-toggle');
let isDarkMode = localStorage.getItem('theme') === 'dark';

if (isDarkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
});

const form = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const statusMessage = document.getElementById('status-message');
const weatherDisplay = document.getElementById('weather-display');

const locationName = document.getElementById('location-name');
const currentTemp = document.getElementById('current-temp');
const weatherDesc = document.getElementById('weather-desc');
const windSpeed = document.getElementById('wind-speed');
const humidity = document.getElementById('humidity');
const forecastGrid = document.getElementById('forecast-grid');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (!city) return;

    statusMessage.textContent = 'Fetching weather data...';
    statusMessage.classList.remove('hidden');
    weatherDisplay.classList.add('hidden');

    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            statusMessage.textContent = 'City not found. Please try again.';
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`);
        const weatherData = await weatherRes.json();

        locationName.textContent = `${name}, ${country}`;
        currentTemp.textContent = Math.round(weatherData.current_weather.temperature);
        weatherDesc.textContent = `Wind speed: ${weatherData.current_weather.windspeed} km/h`;
        windSpeed.textContent = `${weatherData.current_weather.windspeed} km/h`;
        humidity.textContent = '--%';

        forecastGrid.innerHTML = '';
        for (let i = 1; i <= 3; i++) {
            const date = weatherData.daily.time[i];
            const maxTemp = Math.round(weatherData.daily.temperature_2m_max[i]);
            const minTemp = Math.round(weatherData.daily.temperature_2m_min[i]);

            const card = document.createElement('div');
            card.className = 'forecast-card';
            card.innerHTML = `
                <div class="date">${date}</div>
                <div class="temp">${maxTemp}° / ${minTemp}°</div>
            `;
            forecastGrid.appendChild(card);
        }

        statusMessage.classList.add('hidden');
        weatherDisplay.classList.remove('hidden');
    } catch (err) {
        statusMessage.textContent = 'Failed to fetch weather data. Check your connection.';
    }
});