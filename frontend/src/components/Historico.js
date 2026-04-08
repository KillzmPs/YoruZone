const Historico = async (Id) => {
    try {
        const res = await fetch('http://localhost:3000/api/historico', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({Id}),
        });

        if (!res.ok) {
            throw new Error("Erro no historico");
        }

        const data = await res.json();
        return data;
    } catch (error) {
        return {erro: error};
    }
}

export default Historico;
