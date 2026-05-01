import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

/**
 * Глобальный перехват специфических ошибок SDK Салюта.
 * Иногда библиотека выбрасывает некритичные исключения при инициализации звука,
 * мы их гасим, чтобы приложение не "падало".
 */
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Получаем текст ошибки
    const errorMsg = event.message?.toLowerCase() || '';
    const errorStack = event.error?.stack?.toLowerCase() || '';

    // Список "мусорных" фраз, которые генерит SDK в браузере
    const isSdkTrash = 
      errorMsg.includes('applicationid') || 
      errorMsg.includes('voiceready') ||
      errorMsg.includes('audiocontext') ||
      errorMsg.includes('play') ||
      errorStack.includes('salutejs'); // Если в стеке вызовов есть библиотека Салюта

    if (isSdkTrash) {
      // Останавливаем панику браузера
      event.stopImmediatePropagation();
      event.preventDefault();
      
      // Выводим только предупреждение и САМУ ошибку, чтобы понимать, что произошло
      console.warn('⚠️ SDK Салюта капризничает (проигнорировано):', event.message);
    } else {
      // Все остальные ошибки (в твоем React коде) выведутся как обычно красным
      console.log('🔍 Зафиксирована обычная ошибка в коде, не мешаю.');
    }
  }, true);

  // Добавляем перехват ошибок для Promise (часто падает именно там)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message?.toLowerCase() || '';
    if (reason.includes('applicationid') || reason.includes('salutejs')) {
      event.preventDefault();
      console.warn('⚠️ SDK Салюта: ошибка в Promise (проигнорировано):', event.reason?.message);
    }
  });
}

// Создаем root один раз
const root = ReactDOM.createRoot(document.getElementById('root'));

/**
 * ВАЖНО: Мы НЕ используем <React.StrictMode>.
 * В режиме разработки StrictMode запускает componentDidMount дважды.
 * Это приводит к тому, что Ассистент пытается открыть два WebSocket-соединения 
 * одновременно, из-за чего сервер Сбера разрывает оба с ошибкой Network Error.
 */
root.render(
  <App />
);