#!/bin/bash

# garante que corre sempre a partir da raiz do projecto
cd "$(dirname "$0")"

# para qualquer ngrok anterior
pkill -f "ngrok http" 2>/dev/null
sleep 1

echo "A iniciar ngrok..."
ngrok http 3001 --log=stdout > /tmp/ngrok.log &
NGROK_PID=$!

# espera até o ngrok estar pronto (máx 15s)
NGROK_URL=""
for i in $(seq 1 15); do
  sleep 1
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else '')" 2>/dev/null)
  if [ -n "$NGROK_URL" ]; then
    break
  fi
  echo "  a aguardar ngrok... ($i/15)"
done

if [ -z "$NGROK_URL" ]; then
  echo "Erro: não foi possível obter o URL do ngrok"
  echo "Log do ngrok:"
  cat /tmp/ngrok.log
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

echo "URL ngrok: $NGROK_URL"

# atualiza os ficheiros do frontend
sed -i '' "s|const API_URL = \".*\"|const API_URL = \"$NGROK_URL\"|g" frontend/src/components/CriarConta.js
sed -i '' "s|const API_URL = \".*\"|const API_URL = \"$NGROK_URL\"|g" frontend/src/components/Login.js
sed -i '' "s|const API_URL = \".*\"|const API_URL = \"$NGROK_URL\"|g" frontend/src/components/Historico.js
sed -i '' "s|const API_URL *= *\".*\"|const API_URL       = \"$NGROK_URL\"|g" frontend/src/pages/Jogo.jsx

echo "Ficheiros atualizados."

# commit e push
git add frontend/src/components/CriarConta.js frontend/src/components/Login.js frontend/src/components/Historico.js frontend/src/pages/Jogo.jsx
git commit -m "chore: update API_URL to ngrok tunnel $NGROK_URL"
git push

echo ""
echo "Deploy feito! O Vercel vai atualizar em ~30s."
echo "Backend local tem de estar a correr: cd backend && node index.js"
echo "ngrok PID: $NGROK_PID — para parar: kill $NGROK_PID"
