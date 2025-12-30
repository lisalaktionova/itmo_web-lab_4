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
            
            // Если есть сохраненные города, сразу грузим погоду
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

// Запрос геолокации - ИСПРАВЛЕННАЯ ВЕРСИЯ
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
                console.log('Got position:', position.coords);
                
                // Создаем город для текущего местоположения БЕЗ названия
                // (название получим позже или используем стандартное)
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
                console.error('Geolocation error:', error);
                showError('Не удалось определить город по координатам');
                state.useGeolocation = false;
                saveState();
                showCityModal();
            }
        },
        (error) => {
            console.error('Geolocation permission error:', error);
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
    elements.suggestions.innerHTML = '';
    elements.suggestions.style.display = 'none';
    elements.cityError.textContent = '';
    hideError(); // Скрываем общие ошибки при показе модалки
}

// Скрыть модальное окно
function hideCityModal() {
    elements.cityModal.classList.add('hidden');
    // ОЧИЩАЕМ ошибку при закрытии
    elements.cityError.textContent = '';
    // Сбрасываем поле ввода
    elements.cityInput.value = '';
    // Скрываем подсказки
    elements.suggestions.innerHTML = '';
    elements.suggestions.style.display = 'none';
}

// Обработка ввода города
function handleCityInput() {
    const query = elements.cityInput.value.trim();
    elements.suggestions.innerHTML = '';
    
    if (query.length < 2) {
        elements.suggestions.style.display = 'none';
        return;
    }
    
    // Фильтруем популярные города
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
        elements.cityError.textContent = '';
    }
}

// Добавление города - ИСПРАВЛЕННАЯ ВЕРСИЯ С ВАЛИДАЦИЕЙ
async function addCity() {
    const cityName = elements.cityInput.value.trim();
    
    if (!cityName) {
        showCityError('Введите название города');
        return;
    }
    
    // Проверка на минимальную длину
    if (cityName.length < 2) {
        showCityError('Название города должно содержать минимум 2 символа');
        return;
    }
    
    // Проверка на существующий город
    if (state.cities.some(city => 
        city.name.toLowerCase() === cityName.toLowerCase() ||
        (city.isCurrentLocation && cityName.toLowerCase() === 'текущее местоположение')
    )) {
        showCityError('Этот город уже добавлен');
        return;
    }
    
    showLoadingInModal();
    
    try {
        const coords = await getCityCoords(cityName);
        
        if (!coords || !coords.latitude || !coords.longitude) {
            throw new Error('Координаты города не найдены');
        }
        
        // Проверка на дубликат по координатам
        if (state.cities.some(city => 
            Math.abs(city.latitude - coords.latitude) < 0.01 && 
            Math.abs(city.longitude - coords.longitude) < 0.01
        )) {
            showCityError('Этот город уже добавлен');
            return;
        }
        
        // Ограничение на количество городов (максимум 5 для примера)
        if (state.cities.length >= 5) {
            showCityError('Можно добавить не более 5 городов');
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
        console.error('City add error:', error);
        showCityError('Город не найден. Проверьте правильность написания.');
    }
}

// Получение координат города - ИСПРАВЛЕННАЯ ВЕРСИЯ
async function getCityCoords(cityName) {
    try {
        const response = await fetch(
            `${GEOCODING_API}?name=${encodeURIComponent(cityName)}&count=10&language=ru`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            throw new Error('Город не найден');
        }
        
        // Ищем наиболее подходящий город (первый в списке)
        const city = data.results[0];
        
        // Проверяем что это действительно город
        if (city.feature_code !== 'PPL' && city.feature_code !== 'PPLA' && 
            city.feature_code !== 'PPLC' && city.feature_code !== 'PPLA2') {
            console.log('Found location is not a city:', city.feature_code);
        }
        
        return {
            latitude: city.latitude,
            longitude: city.longitude,
            name: city.name,
            country: city.country
        };
    } catch (error) {
        console.error('Error fetching city coords:', error);
        throw new Error('Не удалось найти город. Проверьте название или попробуйте другой город.');
    }
}

// Показать ошибку в модальном окне
function showCityError(message) {
    elements.cityError.textContent = message;
    elements.cityError.style.color = '#e74c3c';
    elements.cityError.style.marginTop = '10px';
    elements.cityError.style.minHeight = '20px';
    
    // Сбрасываем состояние кнопки
    elements.addCityBtn.innerHTML = 'Добавить';
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
        console.error('Weather load error:', error);
        showError('Ошибка при загрузке погоды. Проверьте подключение к интернету.');
    }
}

// Получение данных о погоде
async function getWeather(city) {
    try {
        const response = await fetch(
            `${WEATHER_API}?latitude=${city.latitude}&longitude=${city.longitude}` +
            `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
            `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
            `&timezone=auto&forecast_days=3`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.current || !data.daily) {
            throw new Error('Некорректные данные о погоде');
        }
        
        city.weather = data;
        return data;
    } catch (error) {
        console.error('Error fetching weather:', error);
        throw error;
    }
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
    
    // Автоматически применяем компактный режим
    const isCompact = state.cities.length >= 3;
    
    state.cities.forEach((city, index) => {
        if (!city.weather) return;
        
        const weatherCard = createWeatherCard(city, index);
        
        // Добавляем класс компактности если нужно
        if (isCompact) {
            weatherCard.classList.add('compact');
        }
        
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
                `<button class="remove-city" data-index="${index}" title="Удалить город">
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
                        ${daily.precipitation_probability_max ? 
                            `<div class="precipitation">Вероятность осадков: ${daily.precipitation_probability_max[i]}%</div>` : ''}
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
    if (index >= 0 && index < state.cities.length) {
        state.cities.splice(index, 1);
        saveState();
        
        if (state.cities.length === 0) {
            // Если удалили все города, показываем запрос геолокации
            state.useGeolocation = true;
            saveState();
        }
        
        loadWeatherForAllCities();
    }
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
        51: 'Слабая морось',
        53: 'Умеренная морось',
        55: 'Сильная морось',
        56: 'Ледяная морось',
        57: 'Сильная ледяная морось',
        61: 'Слабый дождь',
        63: 'Умеренный дождь',
        65: 'Сильный дождь',
        66: 'Ледяной дождь',
        67: 'Сильный ледяной дождь',
        71: 'Слабый снег',
        73: 'Умеренный снег',
        75: 'Сильный снег',
        77: 'Снежные зерна',
        80: 'Слабый ливень',
        81: 'Умеренный ливень',
        82: 'Сильный ливень',
        85: 'Слабый снегопад',
        86: 'Сильный снегопад',
        95: 'Гроза',
        96: 'Гроза с градом',
        99: 'Сильная гроза с градом'
    };
    
    return weatherCodes[code] || 'Неизвестно';
}

// Получение иконки погоды по коду
function getWeatherIcon(code) {
    if (code === 0 || code === 1) return '<i class="fas fa-sun" title="Ясно"></i>';
    if (code === 2) return '<i class="fas fa-cloud-sun" title="Переменная облачность"></i>';
    if (code === 3) return '<i class="fas fa-cloud" title="Пасмурно"></i>';
    if (code >= 45 && code <= 48) return '<i class="fas fa-smog" title="Туман"></i>';
    if (code >= 51 && code <= 57) return '<i class="fas fa-cloud-rain" title="Морось"></i>';
    if (code >= 61 && code <= 67) return '<i class="fas fa-cloud-showers-heavy" title="Дождь"></i>';
    if (code >= 71 && code <= 77) return '<i class="fas fa-snowflake" title="Снег"></i>';
    if (code >= 80 && code <= 82) return '<i class="fas fa-cloud-rain" title="Ливень"></i>';
    if (code >= 85 && code <= 86) return '<i class="fas fa-snowflake" title="Снегопад"></i>';
    if (code >= 95 && code <= 99) return '<i class="fas fa-bolt" title="Гроза"></i>';
    return '<i class="fas fa-question" title="Неизвестно"></i>';
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


