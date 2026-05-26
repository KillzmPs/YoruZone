const API_URL = "https://caa2fb0b00889c.lhr.life";

const LogIn = async (email, password) => {
    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({email, password}),
        });

        if (!res.ok) {
            throw new Error("Erro ao iniciar sessão");
        }

        const data = await res.json();
        return data;
    } catch (error) {
        return {erro: error};
    }
};

export default LogIn;
