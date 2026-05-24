const API_URL = "https://yoru-zone-ivbq.vercel.app";

const Historico = async (Id) => {
    try {
        const res = await fetch(`${API_URL}/api/historico`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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
