import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { UserProvider } from './context/UserContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <SocketProvider>
                <NotificationProvider>
                    <UserProvider>
                        <App />
                    </UserProvider>
                </NotificationProvider>
            </SocketProvider>
        </BrowserRouter>
    </StrictMode>,
)
