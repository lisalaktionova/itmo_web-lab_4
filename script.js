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
        try {
            const parsed = JSON.parse(saved);
            state.cities = parsed.cities || [];
            state.useGeolocation = parsed.useGeolocation !== false;
            
            if (state.cities.length > 0) {
                loadWeatherForAllCities();
            }
        } catch (e) {
            console.error('Error loading state:', e);
            state.cities = [];
            state.useGeolocation = true;
        }
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
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.cityModal.classList.contains('hidden')) {
            hideCityModal();
        }
    });
    
    // Выбор подсказки по Enter
    elements.cityInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCity();
        }
    });
}

// Проверка геолокации
function checkGeolocation() {
    if (state.cities.length > 0) {
        elements.locationRequest.classList.add('hidden');
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
                state.cities.push({
                    name: 'Текущее местоположение',
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    isCurrentLocation: true
                });
                
                saveState();
                await loadWeatherForAllCities();
                hideLoading();
            } catch (error) {
                showError('Не удалось определить город по координатам');
                state.useGeolocation = false;
                saveState();
                showCityModal();
            }
        },
        (error) => {
            let errorMessage = 'Доступ к геолокации отклонен';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Доступ к геолокации отклонен. Разрешите доступ в настройках браузера.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Информация о местоположении недоступна.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Время ожидания геолокации истекло.';
                    break;
            }
            
            showError(errorMessage);
            state.useGeolocation = false;
            saveState();
            hideLoading();
            showCityModal();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
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

// Показать модальное окно добавления города
function showCityModal() {
    elements.cityModal.classList.remove('hidden');
    elements.cityInput.focus();
    elements.cityInput.value = '';
    elements.cityInput.classList.remove('error');
    elements.suggestions.innerHTML = '';
    elements.suggestions.style.display = 'none';
    hideCityError();
    hideError();
}

// Скрыть модальное окно
function hideCityModal() {
    elements.cityModal.classList.add('hidden');
    hideCityError();
    elements.cityInput.value = '';
    elements.suggestions.innerHTML = '';
    elements.suggestions.style.display = 'none';
}

// Скрыть ошибку в модальном окне
function hideCityError() {
    elements.cityError.textContent = '';
    elements.cityError.style.display = 'none';
    elements.cityInput.classList.remove('error');
}

// Обработка ввода города
function handleCityInput() {
    const query = elements.cityInput.value.trim();
    elements.suggestions.innerHTML = '';
    
    if (query.length < 2) {
        elements.suggestions.style.display = 'none';
        return;
    }
    
    const popularCities = [
        'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
        'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
        'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград',
        'Киев', 'Минск', 'Астана', 'Лондон', 'Париж',
        'Берлин', 'Мадрид', 'Рим', 'Нью-Йорк', 'Токио'
    ];
    
    const filtered = popularCities.filter(city =>
        city.toLowerCase().includes(query.toLowerCase())
    );
    
    if (filtered.length > 0) {
        filtered.forEach(city => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = city;
            div.dataset.city = city;
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
        elements.cityInput.value = e.target.dataset.city;
        elements.suggestions.innerHTML = '';
        elements.suggestions.style.display = 'none';
        hideCityError();
    }
}

// Добавление города
async function addCity() {
    const cityName = elements.cityInput.value.trim();
    
    // Очищаем предыдущую ошибку
    hideCityError();
    
    if (!cityName) {
        showCityError('Введите название города');
        elements.cityInput.classList.add('error');
        return;
    }
    
    if (cityName.length < 2) {
        showCityError('Название города должно содержать минимум 2 символа');
        elements.cityInput.classList.add('error');
        return;
    }
    
    const cityExists = state.cities.some(city => 
        city.name.toLowerCase() === cityName.toLowerCase()
    );
    
    if (cityExists) {
        showCityError('Этот город уже добавлен');
        elements.cityInput.classList.add('error');
        return;
    }
    
    showLoadingInModal();
    
    try {
        const coords = await getCityCoords(cityName);
        
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
        console.error('City add error:', error);
        showCityError('Город не найден. Проверьте правильность написания.');
        elements.cityInput.classList.add('error');
    }
}

// Получение координат города
async function getCityCoords(cityName) {
    try {
        // Кодируем название для URL
        const encodedName = encodeURIComponent(cityName);
        
        // Делаем запрос с параметрами для русских названий
        const response = await fetch(
            `${GEOCODING_API}?name=${encodedName}&count=10&language=ru&format=json`
        );
        
        if (!response.ok) {
            console.error('HTTP Error:', response.status, response.statusText);
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Логируем ответ для отладки
        console.log('Geocoding API response:', data);
        
        if (!data.results || data.results.length === 0) {
            console.log('No results found for:', cityName);
            throw new Error('Город не найден');
        }
        
        // Ищем наиболее подходящий результат
        let bestMatch = data.results[0];
        
        // Пытаемся найти точное совпадение по названию
        const exactMatch = data.results.find(city => 
            city.name.toLowerCase() === cityName.toLowerCase() ||
            city.ascii_name?.toLowerCase() === cityName.toLowerCase()
        );
        
        if (exactMatch) {
            bestMatch = exactMatch;
        }
        
        console.log('Selected city:', bestMatch.name, 'at', bestMatch.latitude, bestMatch.longitude);
        
        return {
            latitude: bestMatch.latitude,
            longitude: bestMatch.longitude,
            name: bestMatch.name,
            country: bestMatch.country
        };
        
    } catch (error) {
        console.error('Geocoding error:', error);
        throw new Error('Не удалось найти город. Проверьте название и попробуйте снова.');
    }
}


// Показать ошибку в модальном окне
function showCityError(message) {
    elements.cityError.textContent = message;
    elements.cityError.style.display = 'block';
    elements.cityError.style.color = '#e74c3c';
    
    elements.addCityBtn.innerHTML = 'Добавить';
    elements.addCityBtn.disabled = false;
}

// Показать загрузку в модальном окне
function showLoadingInModal() {
    hideCityError();
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
        showError('Ошибка при загрузке погоды. Проверьте подключение к интернету.');
    }
}

// Получение данных о погоде
async function getWeather(city) {
    const response = await fetch(
        `${WEATHER_API}?latitude=${city.latitude}&longitude=${city.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&timezone=auto&forecast_days=3`
    );
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
    
    if (state.cities.length === 0) {
        elements.weatherContainer.classList.add('hidden');
        checkGeolocation();
        return;
    }
    
    // Автоматически меняем класс при 3+ городах
    if (state.cities.length >= 3) {
        elements.weatherContainer.classList.add('many-cities');
    } else {
        elements.weatherContainer.classList.remove('many-cities');
    }
    
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
            <div class="weather-description">${getWeatherDescription(current.weather_code)}</div>
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
        0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность',
        3: 'Пасмурно', 45: 'Туман', 48: 'Туман с изморозью',
        51: 'Слабая морось', 53: 'Умеренная морось', 55: 'Сильная морось',
        61: 'Слабый дождь', 63: 'Умеренный дождь', 65: 'Сильный дождь',
        71: 'Слабый снег', 73: 'Умеренный снег', 75: 'Сильный снег',
        80: 'Слабый ливень', 81: 'Умеренный ливень', 82: 'Сильный ливень',
        85: 'Слабый снегопад', 86: 'Сильный снегопад', 95: 'Гроза'
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

