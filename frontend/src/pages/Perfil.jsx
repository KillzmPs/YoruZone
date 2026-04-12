import { useEffect, useState } from "react";
import { useNotification } from "../context/NotificationContext.jsx";
import { useUser } from "../context/UserContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useNavigate } from "react-router-dom";
import Historico from "../components/Historico.js";

function Perfil() {
    const [code, setCode] = useState('');
    const [lobbyCode, setLobbyCode] = useState('');
    const [players, setPlayers] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [historico, setHistorico] = useState([]);

    const { notifySuccess, notifyError } = useNotification();
    const { user, logout } = useUser();
    const socket = useSocket();
    const navigate = useNavigate();

    const nick = user?.nick;
    const userId = user?.id;

    useEffect(() => {
        if(!user) {
            notifyError("Não deverias estar aqui")
            navigate("/");
        }
    }, []);

    useEffect(() => {
        socket.on("lobbyCreated", ({ code }) => {
            setLobbyCode(code);
            setIsHost(true);
            setPlayers([nick]);
            notifySuccess(`Lobby criado: ${code}`);
        });

        socket.on("playerJoined", (playersList) => {
            const uniquePlayers = [...new Set(playersList.map(p => p.nick))];
            setPlayers(uniquePlayers);
            if (uniquePlayers.length === 2) {
                notifySuccess("Lobby cheio! Esperando o host iniciar...");
            }
        });

        socket.on("gameStarting", ({ players, code: startCode }) => {
            startCountdown(players.map(p => p.nick), startCode);
        });

        socket.on("errorLobby", (msg) => notifyError(msg));

        return () => {
            socket.off("lobbyCreated");
            socket.off("playerJoined");
            socket.off("gameStarting");
            socket.off("errorLobby");
        };
    }, [nick]);

    useEffect(() => {
        const loadHistorico = async () => {
            const data = await Historico(userId);
            setHistorico(data);
        };
        loadHistorico();
    }, [userId]);

    const criarLobby = () => {
        socket.emit("createLobby", { nick });
    };

    const entrarLobby = () => {
        if (!code) return notifyError("Insera o código do lobby!");
        socket.emit("joinLobby", { code, nick });
        setLobbyCode(code);
    };

    const startGame = () => {
        if (!lobbyCode) return;
        socket.emit("startGame", { code: lobbyCode });
    };

    const startCountdown = (playersList, startCode) => {
        const finalCode = startCode || lobbyCode;
        let counter = 5;
        setCountdown(counter);

        const interval = setInterval(() => {
            counter -= 1;
            setCountdown(counter);

            if (counter <= 0) {
                clearInterval(interval);
                navigate("/jogo", {
                    state: {
                        players: playersList,
                        lobbyCode: finalCode,
                    }
                });
            }
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white flex flex-col items-center p-10 gap-10">

            <div className="w-full max-w-4xl flex justify-between items-center">
                <h1 className="text-3xl font-bold">Perfil</h1>
                <div className="bg-gray-700 px-4 py-2 rounded-xl cursor-pointer hover:scale-105 transition" onClick={() => {logout();navigate('/')}}>
                    {nick}
                </div>
            </div>

            <div className="bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-2xl flex flex-col gap-6">
                <button
                    className="bg-green-500 py-4 rounded-xl text-xl font-bold hover:scale-105 transition"
                    onClick={criarLobby}
                >
                    Criar Lobby
                </button>

                <div className="flex gap-3">
                    <input
                        className="flex-1 px-4 py-3 text-white bg-gray-700 rounded-lg"
                        placeholder="Código do lobby"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                    <button
                        className="bg-blue-500 px-6 rounded-lg hover:scale-105 transition"
                        onClick={entrarLobby}
                    >
                        Entrar
                    </button>
                </div>

                {lobbyCode && (
                    <div className="bg-gray-700 p-4 rounded-xl text-center text-lg">
                        Código: <b className="text-yellow-300 tracking-widest">{lobbyCode}</b>
                    </div>
                )}

                {players.length > 0 && (
                    <div>
                        <h3 className="text-lg mb-2">Jogadores:</h3>
                        <div className="flex gap-3">
                            {players.map((p, i) => (
                                <div key={i} className="bg-gray-600 px-4 py-2 rounded-lg">
                                    {p}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isHost && players.length >= 2 && countdown === null && (
                    <button
                        className="mt-5 bg-red-500 px-6 py-3 rounded-xl font-bold hover:scale-105 transition"
                        onClick={startGame}
                    >
                        Começar Jogo
                    </button>
                )}

                {countdown !== null && (
                    <div className="mt-5 text-2xl font-bold text-yellow-400 text-center">
                        Jogo a começar em: {countdown}s
                    </div>
                )}
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-2xl flex flex-col gap-3">
                <h2 className="text-xl mb-3">Histórico de partidas</h2>
                {historico.length === 0 && (
                    <p className="text-gray-400">Ainda sem jogos...</p>
                )}
                {historico.map((jogo) => (
                    <div
                        key={jogo.Id}
                        className={`flex justify-between px-4 py-2 rounded-lg ${
                            jogo.estado === "Vitória"
                                ? "bg-green-600"
                                : jogo.estado === "Derrota"
                                    ? "bg-red-600"
                                    : "bg-gray-700"
                        }`}
                    >
                        <span>{jogo.adversario}</span>
                        <span>{jogo.estado}</span>
                        <span>{jogo.Data.slice(0, 10)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Perfil;