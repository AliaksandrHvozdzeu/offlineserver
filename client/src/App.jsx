import './App.css'
import OfflineChat from './components/OfflineChat'

function App() {
  return (
    <div className="app">
      <header className="site-header">
        <h1>Offline Connect</h1>
        <p>Сайт и чат в локальной Wi‑Fi сети</p>
      </header>
      <main className="site-main">
        <section className="intro">
          <h2>Добро пожаловать</h2>
        </section>
        <OfflineChat />
      </main>
      <footer className="site-footer">
        <p>Offline Connect Server</p>
      </footer>
    </div>
  )
}

export default App
