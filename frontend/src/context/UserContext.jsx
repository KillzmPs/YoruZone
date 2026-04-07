import { createContext, useContext, useState} from "react";

const UserContext = createContext();

export function UserProvider({ children}) {
    const [user, setUser] = useState(null);

    const log = (dados) => {
        localStorage.setItem('user', JSON.stringify(dados));
        setUser(dados);
    }

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user', JSON.stringify(user));
    }

    return (
        <UserContext.Provider value={{ user, log, logout }}>
            {children}
        </UserContext.Provider>
    );
}
export const useUser = () => useContext(UserContext);