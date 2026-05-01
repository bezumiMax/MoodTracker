import React from 'react';
import { createSmartappDebugger } from '@salutejs/client';
import { pipeline, env } from '@xenova/transformers';
import { kmeans } from 'ml-kmeans';
import './App.css';

// 1. Глобальная переменная для предотвращения дублирования сокетов
let globalAssistant = null;

const APP_ID = "019de0cf-282b-7797-a8e1-7ae166bef0c6";

if (typeof window !== 'undefined') {
    window.appConfig = {
        applicationId: APP_ID,
        appversionId: "1.0.0"
    };
    window.__STP_CONFIG__ = window.appConfig;
}

const initializeAssistant = (getState) => {
    const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJqdGkiOiIwMTlkZTQ0OC1hYmNkLTczNDItOTg3NC01MDg3ZTJjOGQyYjciLCJzdWIiOiJiNWJmYThkYzc2YTcwY2Q5MGZlNTE4MmQ5ZDdkNzFkZDk2ZTEwMjc0ZTMyODkyZDdlMzE1MmI2YzU1MDg4ZWQ5NTM5YmU5MjcwMDQyNjI5OCIsImlzcyI6IktFWU1BU1RFUiIsImV4cCI6MTc3NzczNzg2MSwiYXVkIjoiVlBTIiwidXNyIjoiMDE5Y2ZmZDktNDY4YS03OGE1LWE3MWItMTI0ZWZlMmVkNDdjIiwiaWF0IjoxNzc3NjUxNDUxLCJzaWQiOiIwMTlkZTQ0OC1hYmNkLTczOWUtOTg3NS0xOGYzMTNjMzcwNTUifQ.jNpW731t1oNkSs6u8MVugWLM1vxebA816JtadTCDi0CfKeZn64xeWoBvzpspoAZEN-Zoj7f6uX58Hrt7wb6af5YLqpsiylVsXrtZ6trjnIz8lzDk7Y--awo1bbGgDsIs7BnSVKpUhovyLzM-QWn5-7JzVPijxi-kTaqXIv22hDTKpo9krUk3lZE5vyg2UknAf_dywkHCdxd8rmKplxKpl_S_nDqv3s-AO9rnZbQ6-hntTJOBj2JloBscZKS6O1jrSn7ug2uI4u108V7Mj-9dmp5xDzhxf1qcFFGHEXeqSuZ69wAVVsLwRwfZjYbnEY2uOLpHgthtVHFt3XSZe6woaAeZUWUNd8fPcd-3buL-02tRjRyn1ncme3mhtmxfmyuS88qgUiV2WEN2z749_kFe5d6n5RB1SUEr_pPxVa_eAO5PGF_TPeVB_S2G1jPedBfucT2ji9CFCKmUhBKYsXks-uXAeijr02ZZT1YGXvpvFhmwygRtp3lfupQ43YhHZ6J8QU5lm_K6DT4Ufv0PPBdXtXb5nceofZMTlokbdcu13c42dkWORaACtjLtObQhQiOAAu405YkwOAsfAjdIOZ-ej90ZLC0nuYGKxiyieClfFSfxeUYxbWNFykqPkItMIaxpjWGfge5Rel2jt6CfKQCF-bII9zRBDKLXMZjl-5mPZHU"; 

    return createSmartappDebugger({
        token: token,
        initPhrase: "MoodTracker",
        getState,
        surface: "SBERBOX",
        testData: {
            applicationId: APP_ID,
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
            loading: true,
            inputText: '' // Для ручного ввода
        };
        this.assistant = null; 
    }

    async componentDidMount() {
        if (globalAssistant) {
            this.assistant = globalAssistant;
        } else {
            try {
                const assistantInstance = initializeAssistant(() => ({ moods: this.state.moods }));
                this.assistant = assistantInstance;
                globalAssistant = assistantInstance;

                this.assistant.on('data', (event) => {
                    if (event.type === 'smart_app_data') {
                        this.dispatchAssistantAction(event.smart_app_data);
                    }
                });
            } catch (e) {
                console.error("Ошибка ассистента:", e);
            }
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
        } catch (err) {
            this.setState({ loading: false });
        }
    }

    dispatchAssistantAction = (action) => {
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
    if (!text || text.trim() === '') return;
    
    console.log(`\n--- 🧠 Процесс векторизации начат ---`);
    console.log(`📝 Текст для обработки: "${text}"`);
    
    let vector = [];
    if (this.state.model) {
      try {
        // Вызываем модель
        const output = await this.state.model(text, { pooling: 'mean', normalize: true });
        
        // Преобразуем в обычный массив
        vector = Array.from(output.data);
        
        console.log(`✅ Успешно! Размерность вектора: ${vector.length}`);
        console.log(`🔢 Первые 5 чисел вектора:`, vector.slice(0, 5));
      } catch (e) { 
        console.error("❌ Ошибка векторизации внутри ML модели:", e); 
      }
    } else {
      console.warn("⚠️ Модель еще не загружена. Сообщение добавлено без вектора.");
    }

    const mood = {
      id: Math.random().toString(36).substring(7),
      rawPhrase: text,
      timestamp: new Date().toLocaleTimeString(),
      embedding: vector, // Сохраняем результат
    };

    this.setState((prev) => ({
      moods: [...prev.moods, mood],
      inputText: '' 
    }), () => {
      localStorage.setItem('my_moods', JSON.stringify(this.state.moods));
      console.log(`💾 Состояние обновлено. Всего записей: ${this.state.moods.length}`);
      
      if (this.state.moods.length >= 2) {
        console.log("📊 Запуск автоматической перекластеризации...");
        this.showStats();
      }
      console.log(`--- 🏁 Процесс завершен ---\n`);
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
        } catch (e) { console.error(e); }
    }

    render() {
        const { moods, clusters, loading, inputText } = this.state;
        return (
            <div className="App" style={{ padding: '20px', background: '#121212', minHeight: '100vh', color: 'white' }}>
                <header style={{ marginBottom: '30px' }}>
                    <h1>🎙 Mood Tracker</h1>
                    {loading && <p style={{color: '#888'}}>Загрузка нейросети...</p>}
                    
                    {/* Блок ручного ввода */}
                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                        <input 
                            type="text" 
                            value={inputText}
                            onChange={(e) => this.setState({ inputText: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && this.addMood(inputText)}
                            placeholder="Как вы себя чувствуете?"
                            style={{ 
                                padding: '10px', 
                                borderRadius: '5px', 
                                border: '1px solid #333', 
                                background: '#222', 
                                color: 'white',
                                flex: 1
                            }}
                        />
                        <button 
                            onClick={() => this.addMood(inputText)}
                            style={{ 
                                padding: '10px 20px', 
                                borderRadius: '5px', 
                                border: 'none', 
                                background: '#2196f3', 
                                color: 'white',
                                cursor: 'pointer'
                            }}
                        >
                            Добавить вручную
                        </button>
                    </div>
                </header>

                <main style={{ display: 'flex', gap: '20px' }}>
                    <section style={{ flex: 1, border: '1px solid #333', padding: '15px', borderRadius: '8px' }}>
                        <h3>Записи ({moods.length})</h3>
                        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                            {moods.map(m => (
                                <div key={m.id} style={{ borderBottom: '1px solid #222', padding: '5px 0' }}>
                                    <small style={{ color: '#666' }}>{m.timestamp}</small>
                                    <p style={{ margin: '5px 0' }}>{m.rawPhrase}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section style={{ flex: 1, border: '1px solid #333', padding: '15px', borderRadius: '8px' }}>
                        <h3>Анализ (Кластеры)</h3>
                        {clusters.length > 0 ? (
                            clusters.map((c, i) => (
                                <div key={i} style={{ color: c.color, marginBottom: '10px', padding: '10px', background: '#ffffff05', borderLeft: `4px solid ${c.color}` }}>
                                    <strong>{c.name}:</strong> {c.phrase}
                                </div>
                            ))
                        ) : (
                            <p style={{ color: '#555' }}>Нужно минимум 2 записи для анализа</p>
                        )}
                    </section>
                </main>
            </div>
        );
    }
}