// Конфигурация API
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';

// Состояние приложения
let state = {
    cities: [],
    isLoading: false,
    error: null,
    useGeolocation: true
};

// DOM элементы
const elements = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorMessage: document.getElementById('error-message'),
    weatherContainer: document.getElementById('weather-container'),
    refreshBtn: document.getElementById('refresh-btn'),
    addCityBtnMain: document.getElementById('add-city-btn-main'),
    cityModal: document.getElementById('city-modal'),
    cityInput: document.getElementById('city-input'),
    suggestions: document.getElementById('suggestions'),
    cityError: document.getElementById('city-error'),
    addCityBtn: document.getElementById('add-city-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    locationRequest: document.getElementById('location-request'),
    allowLocation: document.getElementById('allow-location'),
    denyLocation: document.getElementById('deny-location')
};

// Список популярных городов для автодополнения
const popularCities = [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
    'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
    'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград',
    'Киев', 'Минск', 'Астана', 'Лондон', 'Париж',
    'Берлин', 'Мадрид', 'Рим', 'Нью-Йорк', 'Токио'
];

// Инициализация приложения
function init() {
    loadState();
    setupEventListeners();
    checkGeolocation();
}

// Загрузка состояния из localStorage
function loadState() {
    const saved = localStorage.getItem('weatherAppState');
    if (saved) {
        const parsed = JSON.parse(saved);
        state.cities = parsed.cities || [];
        state.useGeolocation = parsed.useGeolocation !== false;
    }
}

// Сохранение состояния в localStorage
function saveState() {
    localStorage.setItem('weatherAppState', JSON.stringify({
        cities: state.cities,
        useGeolocation: state.useGeolocation
    }));
}

// Настройка обработчиков событий
function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', refreshWeather);
    elements.addCityBtnMain.addEventListener('click', showCityModal);
    elements.addCityBtn.addEventListener('click', addCity);
    elements.cancelBtn.addEventListener('click', hideCityModal);
    elements.allowLocation.addEventListener('click', requestGeolocation);
    elements.denyLocation.addEventListener('click', denyGeolocation);
    
    elements.cityInput.addEventListener('input', handleCityInput);
    elements.suggestions.addEventListener('click', handleSuggestionClick);
    
    // Закрытие модального окна при клике вне его
    elements.cityModal.addEventListener('click', (e) => {
        if (e.target === elements.cityModal) {
            hideCityModal();
        }
    });
}

// Проверка геолокации
function checkGeolocation() {
    if (state.cities.length > 0) {
        elements.locationRequest.classList.add('hidden');
        loadWeatherForAllCities();
        return;
    }
    
    if (!state.useGeolocation) {
        showCityModal();
        return;
    }
    
    elements.locationRequest.classList.remove('hidden');
}

// Запрос геолокации
function requestGeolocation() {
    elements.locationRequest.classList.add('hidden');
    showLoading();
    
    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается вашим браузером');
        showCityModal();
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const cityName = await getCityNameByCoords(
                    position.coords.latitude,
                    position.coords.longitude
                );
                
                state.cities.push({
                    name: 'Текущее местоположение',
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    isCurrentLocation: true
                });
                
                saveState();
                await loadWeatherForAllCities();
            } catch (error) {
                showError('Не удалось определить город по координатам');
                showCityModal();
            }
        },
        (error) => {
            showError('Доступ к геолокации отклонен');
            state.useGeolocation = false;
            saveState();
            showCityModal();
        }
    );
}

// Отказ от геолокации
function denyGeolocation() {
    state.useGeolocation = false;
    saveState();
    elements.locationRequest.classList.add('hidden');
    showCityModal();
}

// Получение названия города по координатам
async function getCityNameByCoords(lat, lon) {
    const response = await fetch(`${GEOCODING_API}?latitude=${lat}&longitude=${lon}`);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
        return data.results[0].name;
    }
    
    throw new Error('Город не найден');
}

// Показать модальное окно добавления города
function showCityModal() {
    elements.cityModal.classList.remove('hidden');
    elements.cityInput.focus();
    elements.cityInput.value = '';
    elements.suggestions.innerHTML = '';
    elements.cityError.textContent = '';
    elements.locationRequest.classList.add('hidden');
}

// Скрыть модальное окно
function hideCityModal() {
    elements.cityModal.classList.add('hidden');
}

// Обработка ввода города
function handleCityInput() {
    const query = elements.cityInput.value.trim();
    elements.suggestions.innerHTML = '';
    
    if (query.length < 2) {
        elements.suggestions.style.display = 'none';
        return;
    }
    
    const filtered = popularCities.filter(city =>
        city.toLowerCase().includes(query.toLowerCase())
    );
    
    if (filtered.length > 0) {
        filtered.forEach(city => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = city;
            elements.suggestions.appendChild(div);
        });
        elements.suggestions.style.display = 'block';
    } else {
        elements.suggestions.style.display = 'none';
    }
}

// Обработка выбора подсказки
function handleSuggestionClick(e) {
    if (e.target.classList.contains('suggestion-item')) {
        elements.cityInput.value = e.target.textContent;
        elements.suggestions.innerHTML = '';
        elements.suggestions.style.display = 'none';
    }
}

// Добавление города
async function addCity() {
    const cityName = elements.cityInput.value.trim();
    
    if (!cityName) {
        showCityError('Введите название города');
        return;
    }
    
    showLoadingInModal();
    
    try {
        const coords = await getCityCoords(cityName);
        
        if (state.cities.some(city => 
            city.latitude === coords.latitude && 
            city.longitude === coords.longitude
        )) {
            showCityError('Этот город уже добавлен');
            return;
        }
        
        state.cities.push({
            name: cityName,
            latitude: coords.latitude,
            longitude: coords.longitude,
            isCurrentLocation: false
        });
        
        saveState();
        hideCityModal();
        await loadWeatherForAllCities();
    } catch (error) {
        showCityError('Город не найден. Проверьте правильность написания.');
    }
}

// Получение координат города
async function getCityCoords(cityName) {
    const response = await fetch(`${GEOCODING_API}?name=${encodeURIComponent(cityName)}&count=1`);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
        return {
            latitude: data.results[0].latitude,
            longitude: data.results[0].longitude
        };
    }
    
    throw new Error('Город не найден');
}

// Показать ошибку в модальном окне
function showCityError(message) {
    elements.cityError.textContent = message;
    elements.addCityBtn.textContent = 'Добавить';
    elements.addCityBtn.disabled = false;
}

// Показать загрузку в модальном окне
function showLoadingInModal() {
    elements.cityError.textContent = '';
    elements.addCityBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Поиск...';
    elements.addCityBtn.disabled = true;
}

// Загрузка погоды для всех городов
async function loadWeatherForAllCities() {
    if (state.cities.length === 0) {
        checkGeolocation();
        return;
    }
    
    showLoading();
    hideError();
    
    try {
        const weatherPromises = state.cities.map(city => getWeather(city));
        await Promise.all(weatherPromises);
        
        renderWeather();
        hideLoading();
    } catch (error) {
        showError('Ошибка при загрузке погоды');
    }
}

// Получение данных о погоде
async function getWeather(city) {
    const response = await fetch(
        `${WEATHER_API}?latitude=${city.latitude}&longitude=${city.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&timezone=auto&forecast_days=3`
    );
    
    if (!response.ok) {
        throw new Error('Ошибка при получении данных о погоде');
    }
    
    const data = await response.json();
    city.weather = data;
    return data;
}

// Обновление погоды
async function refreshWeather() {
    elements.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обновление...';
    elements.refreshBtn.disabled = true;
    
    await loadWeatherForAllCities();
    
    elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Обновить';
    elements.refreshBtn.disabled = false;
}

// Отображение погоды
function renderWeather() {
    elements.weatherContainer.innerHTML = '';
    
    state.cities.forEach((city, index) => {
        if (!city.weather) return;
        
        const weatherCard = createWeatherCard(city, index);
        elements.weatherContainer.appendChild(weatherCard);
    });
    
    elements.weatherContainer.classList.remove('hidden');
}

// Создание карточки погоды
function createWeatherCard(city, index) {
    const card = document.createElement('div');
    card.className = `weather-card ${city.isCurrentLocation ? 'current' : ''}`;
    
    const current = city.weather.current;
    const daily = city.weather.daily;
    
    // Форматирование дат
    const days = ['Сегодня', 'Завтра', 'Послезавтра'];
    
    card.innerHTML = `
        <div class="weather-header">
            <div class="city-name">${city.name}</div>
            ${!city.isCurrentLocation ? 
                `<button class="remove-city" data-index="${index}">
                    <i class="fas fa-times"></i>
                </button>` : ''
            }
        </div>
        
        <div class="current-weather">
            <div class="temperature">${Math.round(current.temperature_2m)}°C</div>
            <div class="weather-description">${getWeatherDescription(daily.weather_code[0])}</div>
        </div>
        
        <div class="weather-details">
            <div class="detail">
                <i class="fas fa-tint"></i>
                <span>Влажность: ${current.relative_humidity_2m}%</span>
            </div>
            <div class="detail">
                <i class="fas fa-wind"></i>
                <span>Ветер: ${Math.round(current.wind_speed_10m)} м/с</span>
            </div>
        </div>
        
        <div class="forecast">
            <h3>Прогноз на 3 дня</h3>
            <div class="forecast-days">
                ${[0, 1, 2].map(i => `
                    <div class="forecast-day">
                        <div class="day-name">${days[i]}</div>
                        <div class="weather-icon">${getWeatherIcon(daily.weather_code[i])}</div>
                        <div class="forecast-temp">
                            ${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Добавление обработчика удаления города
    const removeBtn = card.querySelector('.remove-city');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => removeCity(index));
    }
    
    return card;
}

// Удаление города
function removeCity(index) {
    state.cities.splice(index, 1);
    saveState();
    loadWeatherForAllCities();
}

// Получение описания погоды по коду
function getWeatherDescription(code) {
    const weatherCodes = {
        0: 'Ясно',
        1: 'Преимущественно ясно',
        2: 'Переменная облачность',
        3: 'Пасмурно',
        45: 'Туман',
        48: 'Туман с изморозью',
        51: 'Морось: слабая',
        53: 'Морось: умеренная',
        55: 'Морось: сильная',
        61: 'Дождь: слабый',
        63: 'Дождь: умеренный',
        65: 'Дождь: сильный',
        71: 'Снег: слабый',
        73: 'Снег: умеренный',
        75: 'Снег: сильный',
        80: 'Ливень: слабый',
        81: 'Ливень: умеренный',
        82: 'Ливень: сильный',
        95: 'Гроза',
        96: 'Гроза с градом',
        99: 'Гроза с сильным градом'
    };
    
    return weatherCodes[code] || 'Неизвестно';
}

// Получение иконки погоды по коду
function getWeatherIcon(code) {
    if (code <= 1) return '<i class="fas fa-sun"></i>';
    if (code <= 3) return '<i class="fas fa-cloud-sun"></i>';
    if (code <= 49) return '<i class="fas fa-smog"></i>';
    if (code <= 65) return '<i class="fas fa-cloud-rain"></i>';
    if (code <= 77) return '<i class="fas fa-snowflake"></i>';
    if (code <= 82) return '<i class="fas fa-cloud-showers-heavy"></i>';
    return '<i class="fas fa-bolt"></i>';
}

// Показать загрузку
function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.weatherContainer.classList.add('hidden');
    elements.error.classList.add('hidden');
}

// Скрыть загрузку
function hideLoading() {
    elements.loading.classList.add('hidden');
}

// Показать ошибку
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.error.classList.remove('hidden');
    elements.weatherContainer.classList.add('hidden');
    elements.loading.classList.add('hidden');
}

// Скрыть ошибку
function hideError() {
    elements.error.classList.add('hidden');
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', init);