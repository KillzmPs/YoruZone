const InsertConta = async (nick, email) => {
    try {
        const res = await fetch('http://localhost:3000/api/criar-conta', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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
}

export default InsertConta;
