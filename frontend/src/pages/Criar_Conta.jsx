import logo from '../assets/Valorant.png';
import { useState } from "react";
import { useNotification } from "../context/NotificationContext.jsx";
import { useNavigate } from "react-router-dom";
import InsertConta from "../components/CriarConta.js";

function CriarConta() {
    const [nick, setNick]   = useState('');
    const [email, setEmail] = useState('');
    const { notifySuccess, notifyError } = useNotification();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nick && !email) return notifyError("Introduza o nick e email");
        if (!nick)           return notifyError("Introduza o nick");
        if (!email)          return notifyError("Introduza o email");

        try {
            const result = await InsertConta(nick, email);
            notifySuccess(result.message || "Conta criada com sucesso!");
            navigate("/");
        } catch (err) {
            notifyError(err.message || "Erro ao criar conta");
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
                    type="text" placeholder="Nick"
                    value={nick} onChange={e => setNick(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
                />

                <input
                    className="w-full py-4 px-4 text-base bg-gray-700 text-white rounded-xl outline-none border border-transparent focus:border-blue-500 transition placeholder-gray-500"
                    type="email" placeholder="Email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
                />

                <button
                    className="w-full py-4 bg-blue-500 text-white rounded-xl text-base font-bold hover:bg-blue-600 transition hover:scale-[1.02]"
                    onClick={handleSubmit}
                >
                    Criar Conta
                </button>

                <div
                    className="text-center text-gray-400 text-sm cursor-pointer hover:text-white transition"
                    onClick={() => navigate('/')}
                >
                    Já tens conta? Entrar
                </div>
            </div>
        </div>
    );
}

export default CriarConta;
