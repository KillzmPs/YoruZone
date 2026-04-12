import logo from '../assets/Valorant.png';
import { useState } from "react";
import { useNotification } from "../context/NotificationContext.jsx";
import { useNavigate } from "react-router-dom";
import InsertConta from "../components/CriarConta.js";

function CriarConta() {
    const [nick, setNick] = useState('');
    const [email, setEmail] = useState('');
    const { notifySuccess, notifyError } = useNotification();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!nick && !email) return notifyError("Introduza o nick e email");
        if (!nick) return notifyError("Introduza o nick");
        if (!email) return notifyError("Introduza o email");

        try {

            const result = await InsertConta(nick, email);

            notifySuccess(result.message || "Conta criada com sucesso!");
            navigate("/");

        } catch (err) {
            notifyError(err.message || "Erro ao criar conta");
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center p-10 bg-radial-[at_50%_75%] from-sky-200 via-blue-400 to-indigo-900 to-90%">
            <div className="flex-1 flex items-center justify-center w-full bg-white dark:bg-gray-800 dark  p-10 rounded-3xl w-[66vw] max-w-[500px] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)] flex-col justify-center gap-10">

                <div className="flex items-center gap-5 mb-15 text-black">
                    <div className="w-[60px] h-[60px] flex items-center justify-center font-bold rounded-xl text-[1.6rem]"><img src={logo} /> </div>
                    <div className="text-2xl opacity-70 mt-1 dark:text-white">
                        Yoru Zone
                    </div>
                </div>

                <input
                    className="w-full py-5 px-1 text-xl border-0 border-b-2 border-gray-200 outline-none transition-all duration-300 text-slate-900 dark:text-white  focus:border-blue-400 focus:tracking-wide"
                    type='text' placeholder='Nick'
                    value={nick} onChange={(e) => setNick(e.target.value)}
                />

                <input
                    className="w-full py-5 px-1 text-xl border-b-2 border-gray-200 outline-none text-slate-900 dark:text-white focus:border-blue-400"
                    type='email' placeholder='Email'
                    value={email} onChange={(e) => setEmail(e.target.value)}
                />

                <button
                    className={`w-full py-6 text-white rounded-xl text-2xl font-bold mt-5 shadow-lg transition-all duration-300 bg-blue-400 hover:brightness-110 hover:-translate-y-1"`}
                    onClick={handleSubmit}
                >
                    Criar Conta
                </button>

                <div
                    className="text-gray-400 cursor-pointer hover:underline"
                    onClick={() => navigate('/')}
                >
                    Já tens conta? Login
                </div>
            </div>
        </div>
    );
}

export default CriarConta;