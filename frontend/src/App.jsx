import {Routes, Route } from 'react-router-dom'
import './App.css'
import Login from './pages/Login'
import CriarConta from "./pages/Criar_Conta";
import Perfil from "./pages/Perfil.jsx";
import Jogo from "./pages/Jogo.jsx";
import { useUser } from "./context/UserContext.jsx";
import { useEffect } from "react";
import { useNavigate} from "react-router-dom";

function App() {
    const {  log } = useUser();
    const navigate = useNavigate();

    useEffect(() => {
        const User = localStorage.getItem('user');

        if (User) {
            const jsonUser = JSON.parse(User);
            log(jsonUser);

            navigate('/perfil');
        }
    }, []);
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
