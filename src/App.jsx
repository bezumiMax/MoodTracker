import React from 'react';
import { createSmartappDebugger } from '@salutejs/client';
import { pipeline, env } from '@xenova/transformers';
import { kmeans } from 'ml-kmeans';
import './App.css';

// 1. Оставляем только функцию-конструктор. 
// Она НЕ вызывает создание объекта сразу, а только описывает, как это сделать.
const initializeAssistant = (getState) => {
  const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIwMTlkZTBjZi0yODJiLTc3OTctYThlMS03YWUxNjZiZWYwYzYiLCJzdWIiOiJiNWJmYThkYzc2YTcwY2Q5MGZlNTE4MmQ5ZDdkNzFkZDk2ZTEwMjc0ZTMyODkyZDdlMzE1MmI2YzU1MDg4ZWQ5NTM5YmU5MjcwMDQyNjI5OCIsImlzcyI6IktFWU1BU1RFUiIsImV4cCI6MTc3NzY3OTU2NSwiYXVkIjoiVlBTIiwidXNyIjoiMDE5Y2ZmZDktNDY4YS03OGE1LWE3MWItMTI0ZWZlMmVkNDdjIiwiaWF0IjoxNzc3NTkzMTU1LCJzaWQiOiIwMTlkZTBjZi0yODJiLTc3ZGMtYThlMi01MzA2YzVjODBmNjIifQ.MNIXEWbvdq3KpKyt-RYPFTGa2sgraoA-QhQpcZ602H3UbWMliRTDciF7xs5yJIQyyVXaPUxXxb7LrjVmj_DV54j7kJfcSBpyMHONIq-nZYk_iIsjejFNlBb7YAEruwZwlkq1N40zX0vSxhKEsVVIF8t_9SdJM5FTziLl8lU-Kz0eHD-noKBplOkubAYUcEDLzrhlh44ArwCKGnPibsIe3y7aKftqiCjHvMdZg4WSjcqwL15VJ6Spx45qeKnWYBMko0wcgI5cc_f2zJGx0LleeTDoDStzbRyvS3n224Hm5_WHkyul0sg_xnXyhWrPp92IWYZxjlUM3_yeII7BYUJdHLFEyzOvN3RuGYHCLYk4TgWHCvifHSDn6fvwKTB2OJJPXtaN7W0YRRBFNtbTJoy0YXqhVFdgrSDaVtnah_VUZI1FnEkoP96wVP4WJABUCIKPKVpM-c7FdYxmY8CZqEFSWSPdNc8alXh9zjiA9ez0GTYTki5JjGiaoaEX7HrEzRIqA1CLvjDb-zd6tlho9U7MNtBIF3KQTe8NcvXz1_j6GuGQ_c8kLIbfVMdqiILdAnQ7-3mrzdBZ0hRHVKKJ15x-HUlgAKCGLWVf5Slgc1--VQRDiS776pCYy1qUPCkPnJicb3qU89_wGGYe1hXH6i5veSeSEHos28aK540cCetcpH8"; 

  // Возвращаем именно результат createSmartappDebugger!
  return createSmartappDebugger({
    token: token,
    initPhrase: "MoodTracker",
    getState,
    surface: "SBERBOX",
    testData: {
      applicationId: "019de0cf-282b-7797-a8e1-7ae166bef0c6",
      appversionId: "1.0.0",
      projectName: "MoodTracker"
    },
    nativePanel: {
      screenshotMode: false,
      tabIndex: -1,
    },
  });
};

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
    
    // В конструкторе только объявляем переменную, но не создаем объект
    this.assistant = null; 
  }

  async componentDidMount() {
    try {
      // 2. Инициализируем ЕДИНСТВЕННЫЙ экземпляр при монтировании компонента
      this.assistant = initializeAssistant(() => ({ moods: this.state.moods }));

      this.assistant.on('data', (event) => {
        console.log("📩 ПОЛУЧЕН ПАКЕТ:", event);
        
        // Корректная обработка входящих команд
        if (event.type === 'smart_app_data') {
          this.dispatchAssistantAction(event.smart_app_data);
        }
      });

      this.assistant.on('error', (err) => {
        console.error("⚠️ Ошибка SDK внутри App:", err);
      });

    } catch (e) { 
      console.error("❌ Критическая ошибка инициализации:", e); 
    }

    this.initML();
  }

  initML = async () => {
    try {
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = window.location.origin + '/'; 
      
      const extractor = await pipeline('feature-extraction', 'models/all-MiniLM-L6-v2', {
        local_files_only: true,
      });
      
      this.setState({ model: extractor, loading: false });
      console.log("✅ Модель загружена");
    } catch (err) {
      console.error("❌ Ошибка ML:", err);
      this.setState({ loading: false });
    }
  }

  dispatchAssistantAction = (action) => {
    console.log("📩 Обработка экшена:", action);
    
    const type = action.type?.toUpperCase();
    const payload = action.payload;

    if (type === 'ADD_MOOD') {
      const text = typeof payload === 'string' ? payload : (payload?.note || "Без текста");
      this.addMood(text);
    } else if (type === 'SHOW_STATS') {
      this.showStats();
    }
  };

  async addMood(text) {
    if (!text) return;
    
    let vector = [];
    if (this.state.model) {
      try {
        const output = await this.state.model(text, { pooling: 'mean', normalize: true });
        vector = Array.from(output.data);
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
      console.error("Ошибка кластеризации:", e); 
    }
  }

  render() {
    const { moods, clusters, loading } = this.state;
    return (
      <div className="App" style={{ padding: '20px', background: '#121212', minHeight: '100vh', color: 'white' }}>
        <header>
          <h1>🎙 Mood Tracker</h1>
          {loading && <p style={{color: '#888'}}>Загрузка нейросети...</p>}
        </header>

        <main style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
          <section style={{ flex: 1, border: '1px solid #333', padding: '15px', borderRadius: '8px' }}>
            <h3>Записи ({moods.length})</h3>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {moods.map(m => (
                <div key={m.id} style={{ borderBottom: '1px solid #222', padding: '5px 0' }}>
                  <small style={{ color: '#666' }}>{m.timestamp}</small>
                  <p style={{ margin: '5px 0' }}>{m.rawPhrase}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ flex: 1, border: '1px solid #333', padding: '15px', borderRadius: '8px' }}>
            <h3>Анализ настроения</h3>
            {clusters.length > 0 ? (
              clusters.map((c, i) => (
                <div key={i} style={{ color: c.color, marginBottom: '10px', padding: '5px', background: '#ffffff05' }}>
                  <strong>{c.name}:</strong> {c.phrase}
                </div>
              ))
            ) : (
              <p style={{ color: '#555' }}>Добавьте хотя бы 2 записи, чтобы увидеть группы</p>
            )}
          </section>
        </main>
      </div>
    );
  }
}