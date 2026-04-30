import React from 'react';
import { createAssistant, createSmartappDebugger } from '@salutejs/client';
import { pipeline, env } from '@xenova/transformers';
import { kmeans } from 'ml-kmeans';
import './App.css';

// --- ДОБАВИТЬ ЭТОТ БЛОК ДЛЯ ДЕБАГА ---
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  // Пытаемся вытащить URL из аргументов fetch
  const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'неизвестный_url');
  
  const response = await originalFetch.apply(this, args);
  
  // Клонируем ответ, чтобы не испортить оригинальный запрос
  const clone = response.clone();
  clone.text().then(text => {
    // Если ответ начинается с тега HTML - бьем тревогу!
    if (text.trim().startsWith('<!DOCTYPE html>') && url.includes('models')) {
      console.error('🚨 ВОТ ОН, ПРЕДАТЕЛЬ! Сервер отдал HTML вместо файла:', url);
    }
  }).catch(() => {});
  
  return response;
};
// -------------------------------------


// 1. Инициализация ассистента (вынесена за пределы класса)
const initializeAssistant = (getState, token) => {
  console.log("🛠 Инициализация SDK с токеном:", token?.substring(0, 15) + "...");

  if (process.env.NODE_ENV === 'development') {
    return createSmartappDebugger({
      token: token,
      initPhrase: `Запусти ${process.env.REACT_APP_SMARTAPP}`,
      getState,
      // ДОБАВЬ ЭТОТ БЛОК:
      extSdkProps: {
        applicationId: 'my-app-id', // Любая строка, это нужно для заглушки
        appversion: '1.0.0',
      },
      nativePanel: {
        defaultText: 'Скажи команду',
        screenshotMode: false,
        tabIndex: -1,
      },
      voice: 'off', 
    });
  }
  return createAssistant({ getState });
};

// 2. Основной класс приложения
export class App extends React.Component {
  constructor(props) {
    super(props);
    const savedMoods = JSON.parse(localStorage.getItem('my_moods')) || [];
    this.state = { 
      moods: savedMoods, 
      clusters: [], 
      model: null, 
      loading: true 
    };
    this.assistant = null;
  }

  async componentDidMount() {
    console.log("🚀 Запуск диагностики и загрузки...");

    const MY_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIwMTlkZGU1ZC00ZTczLTc1MDAtYjYzNy1mOWFjODQ4YmRkODQiLCJzdWIiOiJiNWJmYThkYzc2YTcwY2Q5MGZlNTE4MmQ5ZDdkNzFkZDk2ZTEwMjc0ZTMyODkyZDdlMzE1MmI2YzU1MDg4ZWQ5NTM5YmU5MjcwMDQyNjI5OCIsImlzcyI6IktFWU1BU1RFUiIsImV4cCI6MTc3NzYzODU1MCwiYXVkIjoiVlBTIiwidXNyIjoiMDE5Y2ZmZDktNDY4YS03OGE1LWE3MWItMTI0ZWZlMmVkNDdjIiwiaWF0IjoxNzc3NTUyMTQwLCJzaWQiOiIwMTlkZGU1ZC00ZTczLTc1NzAtYjYzOC1hZGE0YWVkNTcwNWQifQ.UwPwVNb7ovm5gin4mieIZx_bKClKQ7JxXd3jtJqB5j66oJHQ-fw4Mi-xgYCSfn969naw7jGzWSkCtO79v9iMBwyzmbgYbfTU7qLLPMXzv8Cxyh8nVjTnPWAtmrAeBDSlmwIEw392wXTS7XyXU7wh10B8C8MHW9PGXFdNMsiZRgn2xpF0RRjdilpWp95-syCo_331qUoT9CS4smx3fyXNPpuGrq4Agsn3KXuSYRhV4vIoZ8XYi5NJPgtGNyJwB3tZXTzNBFoJ2fEoJwpYnINcuNbEiVl5dvqGvzUNd-EWpDzqZ30xUKxwRAfPwJHs9SRHIeK2eWWa5uWL4vcP08b7EiRlOzlArm49Ex4_f5VgTF1Jv0FSnqnV5CMPwK8IWgHWJZZWON1Njhq1t4oDUB4Ln7Hpjkt1ppPjoeJFuLV2nX7U-lOew526z8YBNMtBKnexhqttvLUnkXknjlkY4ck_VHBmt4lJZLUMAz-XAfl2eJkB9gc1_cJY2E5FkyhfIE--oUgx9-dmfsCKBkBPBxdBrvfDQWKzG_oNGnuj18SpLFVdwFgNMYXT46Z-g3gMoT0iZD9yNm-TCZX__zjoxecnvBTwmoknli5-Kx41EFLouOlXYd_eHyBGAQj7cKfqmueiwLyAqExqxGA618VZH5m6YoKHT8--9h9MB5bm-Q9RuT4"; 

    try {
      // ПЕРЕДАЕМ ТОКЕН ВТОРЫМ АРГУМЕНТОМ
      this.assistant = initializeAssistant(
        () => ({ moods: this.state.moods }), 
        MY_TOKEN,
        {
          appId: "019d0b2b-405e-79da-b5c1-6d7d83a50b96", // Это поможет SDK найти твой навык
          isFirstSession: true,
        }
      );

      this.assistant.on('data', (event) => {
        console.log("📩 ПОЛУЧЕН ПАКЕТ:", JSON.stringify(event, null, 2));
        
        // Универсальный способ достать данные
        const smartData = event.smart_app_data || event.action;
        
        if (smartData) {
          console.log("🎯 Нашли данные команды:", smartData);
          this.dispatchAssistantAction(smartData);
        } else {
          console.warn("⚠️ В пакете нет команд");
        }
      });

      setTimeout(() => {
        if (this.assistant) {
          console.log("🚀 Авто-тест: отправляю команду...");
          this.assistant.sendText('запиши хорошее настроение');
        }
      }, 3000);
    } catch (e) { 
      console.error("Ошибка инициализации:", e); 
    }

    // 2. Загрузка ML модели
    try {
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useBrowserCache = false;
      env.localModelPath = window.location.origin + '/'; 

      const modelID = 'models/all-MiniLM-L6-v2';
      const extractor = await pipeline('feature-extraction', modelID, {
        local_files_only: true,
        model_file_name: 'model' 
      });

      this.setState({ model: extractor, loading: false });
      console.log("✅ Модель готова!");
    } catch (err) {
      console.error("❌ Ошибка модели:", err);
    }
  }

  // Единое место для обработки всех команд ассистента
  // 1. Исправленный диспетчер команд
  dispatchAssistantAction = (action) => {
    console.log("=== ДЕТЕКТИВ КОМАНД ===");
    console.log("Пришел action:", action);

    const type = action.type;
    const payload =
      action.payload ||
      (action.smart_app_data && action.smart_app_data.payload);

    console.log("Тип:", type);
    console.log("Payload:", payload);

    if (type === 'ADD_MOOD') {
      const text = payload || "Без текста";
      console.log("✅ Добавляю:", text);
      this.addMood(text);

    } else if (type === 'SHOW_STATS') {
      console.log("📊 Показываю статистику");
      this.showStats();

    } else {
      console.warn("❓ Неизвестная команда:", type);
    }
  }; // <--- Проверь, чтобы тут была точка с запятой и закрывающая скобка метода

  async addMood(text) {
    if (!text) return;
    
    let vector = [];
    if (this.state.model) {
      try {
        const output = await this.state.model(text, { pooling: 'mean', normalize: true });
        vector = Array.from(output.data);
        console.log("🧬 Вектор создан для:", text);
      } catch (e) {
        console.error("Ошибка векторизации:", e);
      }
    }

    const mood = {
      id: Math.random().toString(36).substring(7),
      rawPhrase: text,
      timestamp: new Date().toLocaleTimeString(),
      embedding: vector,
    };

    this.setState((prev) => ({
      moods: [...prev.moods, mood]
    }), () => {
      localStorage.setItem('my_moods', JSON.stringify(this.state.moods));
      if (this.state.moods.length >= 2) this.showStats();
    });
  }

  showStats() {
    const { moods } = this.state;
    const vectors = moods.map(m => m.embedding).filter(v => v && v.length > 0);
    
    if (vectors.length < 2) return;

    try {
      const k = Math.min(vectors.length, 3);
      const ans = kmeans(vectors, k);
      
      const clusters = ans.clusters.map((clusterIdx, i) => ({
        name: `Группа ${clusterIdx + 1}`,
        phrase: moods[i].rawPhrase,
        color: ['#4caf50', '#f44336', '#2196f3', '#ff9800'][clusterIdx] || '#ccc'
      }));

      this.setState({ clusters });
    } catch (e) {
      console.error("Ошибка K-means:", e);
    }
  }

  render() {
    // Ваш JSX код остается прежним
    const { moods, clusters, loading } = this.state;
    return (
      <div className="container" style={{ padding: '20px', background: '#121212', minHeight: '100vh', color: 'white' }}>
        <header>
          <h1>🎙 Mood Tracker {loading && <span style={{fontSize: '14px', color: '#888'}}>(Загрузка ML...)</span>}</h1>
          <p>Скажи: "Запиши настроение [текст]"</p>
          <button 
            onClick={() => this.addMood("Тестовая запись " + (this.state.moods.length + 1))}
            style={{ padding: '10px', marginTop: '10px', cursor: 'pointer', background: '#4caf50', color: 'white', border: 'none', borderRadius: '5px' }}
          >
            ➕ Добавить запись вручную
          </button>
        </header>

        <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
          <section className="card" style={{ flex: 1, border: '1px solid #333', padding: '15px' }}>
            <h3>История настроений ({moods.length})</h3>
            {moods.length === 0 && <p style={{color: '#666'}}>Записей пока нет</p>}
            {moods.map(m => (
              <div key={m.id} style={{ marginBottom: '10px', borderBottom: '1px solid #222' }}>
                <small>{m.timestamp}</small>
                <p>{m.rawPhrase}</p>
              </div>
            ))}
          </section>

          <section className="card" style={{ flex: 1, border: '1px solid #333', padding: '15px' }}>
            <h3>Анализ (Кластеры)</h3>
            {clusters.length === 0 && <p style={{color: '#666'}}>Добавьте минимум 2 записи</p>}
            {clusters.map((c, i) => (
              <div key={i} style={{ borderLeft: `4px solid ${c.color}`, paddingLeft: '10px', marginBottom: '10px' }}>
                <span style={{ color: c.color, fontWeight: 'bold' }}>{c.name}</span>
                <p>{c.phrase}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    );
  }
}