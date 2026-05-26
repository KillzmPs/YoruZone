#!/bin/bash

# garante que corre sempre a partir da raiz do projecto
cd "$(dirname "$0")"

# para qualquer tunnel anterior
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

echo "A iniciar tunnel Cloudflare..."
cloudflared tunnel --url http://localhost:3001 --no-autoupdate > /tmp/cloudflared.log 2>&1 &
TUNNEL_PID=$!

# espera até obter o URL (máx 30s)
TUNNEL_URL=""
for i in $(seq 1 30); do
  sleep 1
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*.trycloudflare.com' /tmp/cloudflared.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  echo "  a aguardar tunnel... ($i/30)"
done

if [ -z "$TUNNEL_URL" ]; then
  echo "Erro: não foi possível obter o URL do tunnel"
  echo "Log:"
  cat /tmp/cloudflared.log
  kill $TUNNEL_PID 2>/dev/null
  exit 1
fi

echo "URL: $TUNNEL_URL"

# atualiza os ficheiros do frontend
sed -i '' "s|const API_URL = \".*\"|const API_URL = \"$TUNNEL_URL\"|g" frontend/src/components/CriarConta.js
sed -i '' "s|const API_URL = \".*\"|const API_URL = \"$TUNNEL_URL\"|g" frontend/src/components/Login.js
sed -i '' "s|const API_URL = \".*\"|const API_URL = \"$TUNNEL_URL\"|g" frontend/src/components/Historico.js
sed -i '' "s|const API_URL *= *\".*\"|const API_URL       = \"$TUNNEL_URL\"|g" frontend/src/pages/Jogo.jsx

echo "Ficheiros atualizados."

# commit e push
git add frontend/src/components/CriarConta.js frontend/src/components/Login.js frontend/src/components/Historico.js frontend/src/pages/Jogo.jsx
git commit -m "chore: update API_URL to tunnel $TUNNEL_URL"
git push

echo ""
echo "Deploy feito! O Vercel vai atualizar em ~30s."
echo "Backend local tem de estar a correr: cd backend && node index.js"
echo "Tunnel PID: $TUNNEL_PID — para parar: kill $TUNNEL_PID"
