import { createContext, useContext, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "https://socketyoru-production.up.railway.app";
const SocketContext = createContext(null);

let sharedSocket = null;

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  if (!socketRef.current) {
    if (!sharedSocket) sharedSocket = io(SOCKET_URL);
    socketRef.current = sharedSocket;
  }
  return (
    <SocketContext.Provider value={socketRef.current}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
