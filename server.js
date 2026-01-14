const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir arquivos estáticos da pasta public
app.use(express.static('public'));

// --- ESTADO DO JOGO (NA MEMÓRIA) ---
let players = {}; // Armazena { socketId: { id, name, status: 'alive'|'dead', avatar } }
let gameStatus = 'waiting'; // 'waiting', 'active', 'ended'
let eliminationTimer = null;
let currentTargetId = null;
const TIME_TO_DIE = 15; // Segundos para ser eliminado se não pagar

// --- LÓGICA DO SERVIDOR ---
io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    // Jogador entra no Lobby
    socket.on('join_game', (playerName) => {
        if (gameStatus !== 'waiting') {
            socket.emit('error_msg', 'O jogo já começou! Espere a próxima rodada.');
            return;
        }

        players[socket.id] = {
            id: socket.id,
            name: playerName,
            status: 'alive',
            avatar: Math.floor(Math.random() * 5) + 1 // Avatar aleatório 1-5
        };

        // Atualiza a lista para todos
        io.emit('update_players', Object.values(players));
    });

    // ADMIN: Iniciar o jogo (qualquer um pode iniciar neste MVP para testes)
    socket.on('start_game_signal', () => {
        const alivePlayers = Object.values(players).filter(p => p.status === 'alive');
        if (alivePlayers.length < 2) {
            io.emit('error_msg', 'Precisamos de pelo menos 2 jogadores!');
            return;
        }
        gameStatus = 'active';
        io.emit('game_started');
        startEliminationRound();
    });

    // JOGADOR: Simula pagamento para salvar a vida
    socket.on('pay_revive', () => {
        if (gameStatus !== 'active' || socket.id !== currentTargetId) return;

        // Limpa o timer da morte atual
        clearTimeout(eliminationTimer);

        // Notifica que o pagamento foi feito
        io.emit('payment_received', { player: players[socket.id].name });

        // Passa a "batata quente" para outro
        startEliminationRound();
    });

    // Desconexão
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('update_players', Object.values(players));
            
            // Se o alvo desconectou, precisamos reiniciar a rodada se o jogo estiver ativo
            if (gameStatus === 'active' && currentTargetId === socket.id) {
                clearTimeout(eliminationTimer);
                startEliminationRound();
            }
        }
    });
});

// --- MOTOR DO JOGO ---
function startEliminationRound() {
    // 1. Verificar condições de vitória
    const alivePlayers = Object.values(players).filter(p => p.status === 'alive');
    
    if (alivePlayers.length === 1) {
        gameStatus = 'ended';
        io.emit('game_over', alivePlayers[0]);
        // Resetar jogo após 10 segundos
        setTimeout(() => {
            players = {};
            gameStatus = 'waiting';
            io.emit('reset_game');
        }, 10000);
        return;
    }

    if (alivePlayers.length === 0) {
        gameStatus = 'waiting'; // Bug safe
        return;
    }

    // 2. Escolher uma vítima aleatória (que esteja viva)
    // Tenta não escolher a mesma pessoa que acabou de pagar (se possível)
    let candidates = alivePlayers;
    if (alivePlayers.length > 2 && currentTargetId) {
        candidates = alivePlayers.filter(p => p.id !== currentTargetId);
    }
    
    const victimIndex = Math.floor(Math.random() * candidates.length);
    const victim = candidates[victimIndex];
    currentTargetId = victim.id;

    // 3. Notificar todos quem é o alvo
    io.emit('new_target', { 
        targetId: victim.id, 
        targetName: victim.name,
        timeLeft: TIME_TO_DIE 
    });

    // 4. Iniciar contagem regressiva da morte
    eliminationTimer = setTimeout(() => {
        eliminatePlayer(victim.id);
    }, TIME_TO_DIE * 1000);
}

function eliminatePlayer(playerId) {
    if (players[playerId]) {
        players[playerId].status = 'dead';
        io.emit('player_eliminated', { 
            playerId: playerId, 
            playerName: players[playerId].name 
        });
        
        // Continua o jogo
        startEliminationRound();
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando agressivo na porta ${PORT}`);
});
