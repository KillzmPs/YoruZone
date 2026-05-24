import logo from '../assets/Valorant.png';
import { useState } from "react";
import { useNotification } from "../context/NotificationContext.jsx";
import LogIn from "../components/Login.js";
import { useUser } from "../context/UserContext.jsx";
import { useNavigate } from "react-router-dom";

function Login() {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const { notifySuccess, notifyError } = useNotification();
    const { log }    = useUser();
    const navigate   = useNavigate();

    const Log = async (e) => {
        e.preventDefault();
        if (!email && !password) return notifyError("Introduza o E-mail e Password");
        if (!email)              return notifyError("Introduza o E-mail");
        if (!password)           return notifyError("Introduza a Password");

        try {
            const result = await LogIn(email, password);
            if (result["nick"] != null) {
                log(result);
                notifySuccess("Sucesso!");
                navigate("/perfil");
            } else {
                notifyError("Credenciais erradas");
            }
        } catch (error) {
            console.log(error);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
            <div className="bg-gray-800 p-10 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-6">

                <div className="flex items-center gap-4 mb-2">
                    <img src={logo} className="w-12 h-12 rounded-xl" alt="logo" />
                    <span className="text-2xl font-bold text-white">YoruZone</span>
                </div>

                <input
                    className="w-full py-4 px-4 text-base bg-gray-700 text-white rounded-xl outline-none border border-transparent focus:border-blue-500 transition placeholder-gray-500"
                    type="email" placeholder="Email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && Log(e)}
                />

                <input
                    className="w-full py-4 px-4 text-base bg-gray-700 text-white rounded-xl outline-none border border-transparent focus:border-blue-500 transition placeholder-gray-500"
                    type="password" placeholder="Password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && Log(e)}
                />

                <button
                    className="w-full py-4 bg-blue-500 text-white rounded-xl text-base font-bold hover:bg-blue-600 transition hover:scale-[1.02]"
                    onClick={Log}
                >
                    Entrar
                </button>

                <div
                    className="text-center text-gray-400 text-sm cursor-pointer hover:text-white transition"
                    onClick={() => navigate('/criar_conta')}
                >
                    Criar Conta
                </div>
            </div>
        </div>
    );
}

export default Login;
