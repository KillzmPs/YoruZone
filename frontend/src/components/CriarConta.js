const InsertConta = async (nick, email) => {
    try {
        const res = await fetch('https://backend-yoru-zone.vercel.app/api/criar-conta', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({nick, email}),
        });

        if (!res.ok) {
            throw new Error("Erro ao criar conta");
        }

        const dataq = await res.json();
        return data;
    } catch (error) {
        return {erro: error};
    }
}

export default InsertConta;
