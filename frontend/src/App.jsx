import {Routes, Route } from 'react-router-dom'
import './App.css'
import Login from './pages/Login'
import Criar_Conta from "./pages/Criar_Conta";

function App() {

  return (
      <>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/criar_conta" element={<Criar_Conta />} />  
        </Routes>
      </>
  )
}

export default App
