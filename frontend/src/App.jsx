import {Routes, Route } from 'react-router-dom'
import './App.css'
import Login from './pages/Login'
import CriarConta from "./pages/Criar_Conta";
import Perfil from "./pages/Perfil.jsx";
import Jogo from "./pages/Jogo.jsx";

function App() {

  return (
      <>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/criar_conta" element={<CriarConta />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/jogo" element={<Jogo />} />
        </Routes>
      </>
  )
}

export default App
