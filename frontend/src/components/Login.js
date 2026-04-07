const LogIn = async (email, password) => {
    try {
        const res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password}),
        });

        if (!res.ok) {
            throw new Error("Erro ao fazer Login");
        }

        const data = await res.json();
        return data;
    } catch (error) {
        return {erro: error};
    }
}

export default LogIn;