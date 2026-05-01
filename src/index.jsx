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
    const errorMsg = event.message?.toLowerCase() || '';
    if (
      errorMsg.includes('applicationid') || 
      errorMsg.includes('play') || 
      errorMsg.includes('audiocontext')
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
      console.warn('⚠️ Системный перехват: предотвращен крэш из-за SDK Салюта');
    }
  }, true);
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