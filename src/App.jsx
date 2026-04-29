import React from 'react';
import { createAssistant, createSmartappDebugger } from '@salutejs/client';
import { pipeline } from '@xenova/transformers';
import { kmeans } from 'ml-kmeans';
import './App.css';

// 1. Инициализация ассистента (вынесена за пределы класса)
const initializeAssistant = (getState) => {
  // Выводим в консоль начало токена для проверки связи с .env
  console.log("DEBUG: Инициализация с токеном:", process.env.REACT_APP_TOKEN?.substring(0, 10) + "...");

  if (process.env.NODE_ENV === 'development') {
    return createSmartappDebugger({
      token: process.env.REACT_APP_TOKEN ?? '',
      initPhrase: `Запусти ${process.env.REACT_APP_SMARTAPP}`,
      getState,
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
    this.state = { 
      moods: [], 
      clusters: [], 
      model: null, 
      loading: true 
    };
    this.assistant = null;
  }

  async componentDidMount() {
    console.log("Приложение запущено. Начинаю подключение...");

    // А) Сначала запускаем Салют (Приоритет)
    try {
      this.assistant = initializeAssistant(() => ({ moods: this.state.moods }));

      this.assistant.on('start', () => {
        console.log('✅ Ассистент готов! Теперь шар должен крутиться.');
      });

      this.assistant.on('data', (event) => {
        console.log('Получены данные от Салюта:', event);
        const textFromBot = event.character?.text || event.payload?.text || '';
        
        // Обработка текстовых команд
        if (textFromBot.includes('COMMAND_ADD_MOOD')) {
          const phrase = textFromBot
            .replace('COMMAND_ADD_MOOD', '')
            .replace('запиши настроение', '')
            .trim();
          if (phrase) this.addMood(phrase);
        }

        if (textFromBot.includes('COMMAND_SHOW_STATS')) {
          this.showStats();
        }

        // Обработка экшенов (если настроены в SmartApp Studio)
        if (event.type === 'smart_app_data' && event.action) {
          this.dispatchAssistantAction(event.action);
        }
      });

      this.assistant.on('error', (err) => {
        console.error('❌ Ошибка связи с Салютом (WebSocket):', err);
      });

    } catch (e) {
      console.error("Ошибка инициализации SDK:", e);
    }

    // Б) Загрузка ML модели в фоновом режиме
    pipeline('feature-extraction', 'Xenova/rubert-tiny-turbo', {
      allowRemoteModels: true 
    })
      .then(extractor => {
        this.setState({ model: extractor, loading: false });
        console.log("✅ ML модель успешно загружена");
      })
      .catch(err => {
        this.setState({ loading: false });
        console.warn("⚠️ ML модель не загружена. Работаем без векторизации.", err.message);
      });
  }

  dispatchAssistantAction(action) {
    console.log('Action received:', action.type);
    if (action.type === 'ADD_MOOD' && action.payload) {
      this.addMood(action.payload);
    } else if (action.type === 'SHOW_STATS') {
      this.showStats();
    }
  }

  async addMood(text) {
    let embedding = [];
    if (this.state.model) {
      try {
        const output = await this.state.model(text, { pooling: 'mean', normalize: true });
        embedding = Array.from(output.data);
      } catch (e) {
        console.error("Ошибка векторизации фразы:", e);
      }
    }

    const mood = {
      id: Math.random().toString(36).substring(7),
      rawPhrase: text,
      timestamp: new Date().toLocaleTimeString(),
      embedding: embedding,
    };

    this.setState((prev) => ({ moods: [...prev.moods, mood] }));
  }

  showStats() {
    const { moods } = this.state;
    const vectors = moods.map(m => m.embedding).filter(v => v && v.length > 0);
    
    if (vectors.length < 2) {
      console.warn("Нужно хотя бы 2 записи для кластеризации");
      return;
    }

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
    const { moods, clusters, loading } = this.state;
    return (
      <div className="container" style={{ padding: '20px', background: '#121212', minHeight: '100vh', color: 'white' }}>
        <header>
          <h1>🎙 Mood Tracker {loading && <span style={{fontSize: '14px', color: '#888'}}>(Загрузка ML...)</span>}</h1>
          <p>Скажи: "Запиши настроение [текст]"</p>
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