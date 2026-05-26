const API_URL = "https://appreciation-figured-europe-differential.trycloudflare.com";

const InsertConta = async (nick, email) => {
    try {
        const res = await fetch(`${API_URL}/api/criar-conta`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({nick, email}),
        });

        if (!res.ok) {
            throw new Error("Erro ao criar conta");
        }

        const data = await res.json();
        return data;
    } catch (error) {
        return {erro: error};
    }
};

export default InsertConta;
