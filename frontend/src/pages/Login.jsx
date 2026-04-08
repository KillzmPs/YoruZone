import logo from '../assets/Valorant.png';
import { useState } from "react";
import { useNotification } from "../context/NotificationContext.jsx";
import LogIn from "../components/Login.js";
import { useUser } from "../context/UserContext.jsx";
import { useNavigate } from "react-router-dom";

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { notifySuccess, notifyError } = useNotification();
    const { log } = useUser();
    const navigate = useNavigate();

    const Log = async (e) => {
        e.preventDefault();
        if (!email && !password) {
            return notifyError("Introduza o E-mail e Password");
        }
        if (!email) {
            return notifyError("Introduza o E-mail");
        }
        if (!password) {
            return notifyError("Introduza a Password");
        }


        try {
            const result = await LogIn(email, password);
            console.log(result);

            if (result["nick"] != null) {
                log(result);
                notifySuccess("Sucesso!");
                navigate("/perfil");
            } else {
                return notifyError("Credenciais erradas");
            }
        } catch (error) {
            console.log(error);
        }
    }
    return (
        <>
            <div className="min-h-screen flex flex-col items-center relative p-10 transition-opacity bg-radial-[at_50%_75%] from-sky-200 via-blue-400 to-indigo-900 to-90%">
                <div className="flex-1 flex items-center justify-center w-full bg-white dark:bg-gray-800 dark  p-10 rounded-3xl w-[66vw] max-w-[500px] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)] flex-col justify-center gap-10">
                    <div className="flex items-center gap-5 mb-15 text-black">
                        <div className="w-[60px] h-[60px] flex items-center justify-center font-bold rounded-xl text-[1.6rem]"><img src={logo} /> </div>
                        <div className="text-2xl opacity-70 mt-1 dark:text-white">
                            Yoru Zone
                        </div>
                    </div>
                    <div className="w-full">
                        <input className="w-full py-5 px-1 text-xl border-0 border-b-2 border-gray-200 outline-none transition-all duration-300 text-slate-900 dark:text-white  focus:border-blue-400 focus:tracking-wide"
                               type='email' name='email' placeholder='Email'
                               value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="w-full">
                        <input className="w-full py-5 px-1 text-xl border-0 border-b-2 border-gray-200 outline-none transition-all duration-300 text-slate-900 focus:border-blue-400 focus:tracking-wide dark:text-white"
                               type='password' name='password' placeholder='Password'
                               value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>

                    <button  type='submit' className="w-full py-6 bg-blue-400 text-white border-0 rounded-xl cursor-pointer text-2xl font-bold mt-5 shadow-lg transition-all duration-300 hover:brightness-110 hover:-translate-y-1 hover:shadow-xl"
                             onClick={Log}>Login</button>
                    <div className=" text-gray-400 hover:underline" onClick={() => navigate('/criar_conta')}>
                        Criar Conta
                    </div>
                </div>
            </div>
        </>
    )
}

export default Login
