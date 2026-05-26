const API_URL = "https://b1290f9ac6b9b7.lhr.life";

const Historico = async (Id) => {
    try {
        const res = await fetch(`${API_URL}/api/historico`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({Id}),
        });

        if (!res.ok) {
            throw new Error("Erro no histórico");
        }

        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
};


export default Historico;
