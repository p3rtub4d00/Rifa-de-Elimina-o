const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- CONFIGURAÇÃO ---
const TIME_TO_DIE = 15; // Segundos para pagar
const BOT_SURVIVAL_CHANCE = 0.85; // 85% de chance do bot pagar
const BOT_NAMES = [
    "Ghost_Rider", "Killer007", "Viper_X", "Titan_Br", "ShadowHunter",
    "Neon_Wolf", "CyberPunk", "Rich_Kid", "NoobMaster", "Pro_Gamer",
    "Alpha_Male", "Dona_Morte", "Sniper_Elite", "00_Dinheiro", "Rico_Suave"
];

// --- ESTADO DO JOGO ---
let players = {}; 
let gameStatus = 'waiting'; 
let eliminationTimer = null;
let currentTargetId = null;
let botDecisionTimer = null; // Timer para o bot "pensar"

// --- LOGICA DO SERVIDOR ---
io.on('connection', (socket) => {
    console.log('Conexão:', socket.id);

    // Entrar no jogo
    socket.on('join_game', (playerName) => {
        if (gameStatus !== 'waiting') {
            socket.emit('error_msg', 'Jogo em andamento. Aguarde.');
            return;
        }
        addPlayer(socket.id, playerName, false);
    });

    // ADMIN: Adicionar Bots
    socket.on('add_bots', (quantity) => {
        for (let i = 0; i < quantity; i++) {
            const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
            const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            addPlayer(botId, botName, true);
        }
    });

    // ADMIN: Iniciar
    socket.on('start_game_signal', () => {
        const aliveCount = Object.values(players).filter(p => p.status === 'alive').length;
        if (aliveCount < 2) return io.emit('error_msg', 'Mínimo 2 jogadores!');
        
        gameStatus = 'active';
        io.emit('game_started');
        startEliminationRound();
    });

    // JOGADOR REAL: Pagar
    socket.on('pay_revive', () => {
        if (gameStatus !== 'active' || socket.id !== currentTargetId) return;
        processPayment(socket.id);
    });

    // Desconexão
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('update_players', Object.values(players));
            
            if (gameStatus === 'active' && currentTargetId === socket.id) {
                clearTimeout(eliminationTimer);
                clearTimeout(botDecisionTimer);
                startEliminationRound();
            }
        }
    });
});

// --- FUNÇÕES AUXILIARES ---

function addPlayer(id, name, isBot) {
    // Evita nomes duplicados simples
    let finalName = name;
    if (Object.values(players).find(p => p.name === name)) {
        finalName = name + "_" + Math.floor(Math.random() * 100);
    }

    players[id] = {
        id: id,
        name: finalName,
        status: 'alive',
        isBot: isBot,
        avatar: Math.floor(Math.random() * 5) + 1
    };
    io.emit('update_players', Object.values(players));
}

function processPayment(playerId) {
    // Limpa timer da morte
    clearTimeout(eliminationTimer);
    clearTimeout(botDecisionTimer);

    // Notifica todos
    io.emit('payment_received', { player: players[playerId].name });

    // Inicia próxima rodada
    setTimeout(() => {
        startEliminationRound();
    }, 1500); // Pequeno delay dramático
}

function startEliminationRound() {
    const alivePlayers = Object.values(players).filter(p => p.status === 'alive');
    
    // Vitória
    if (alivePlayers.length === 1) {
        gameStatus = 'ended';
        io.emit('game_over', alivePlayers[0]);
        setTimeout(resetGame, 8000);
        return;
    }

    if (alivePlayers.length === 0) { resetGame(); return; }

    // Escolher vítima (tenta não repetir o mesmo instantaneamente)
    let candidates = alivePlayers;
    if (alivePlayers.length > 2 && currentTargetId) {
        candidates = alivePlayers.filter(p => p.id !== currentTargetId);
    }
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    currentTargetId = victim.id;

    // Notificar
    io.emit('new_target', { 
        targetId: victim.id, 
        targetName: victim.name,
        timeLeft: TIME_TO_DIE 
    });

    // Timer da Morte (Servidor)
    eliminationTimer = setTimeout(() => {
        eliminatePlayer(victim.id);
    }, TIME_TO_DIE * 1000);

    // --- LÓGICA DO BOT ---
    if (victim.isBot) {
        handleBotTurn(victim.id);
    }
}

function handleBotTurn(botId) {
    // Bot "pensa" um tempo aleatório entre 2s e (TIME_TO_DIE - 2s)
    const thinkingTime = Math.floor(Math.random() * (TIME_TO_DIE - 4) + 3) * 1000;
    
    botDecisionTimer = setTimeout(() => {
        // Verifica se o jogo ainda está rolando e se ele ainda é o alvo
        if (gameStatus !== 'active' || currentTargetId !== botId) return;

        // Decide se paga ou morre
        if (Math.random() < BOT_SURVIVAL_CHANCE) {
            // Bot Paga
            processPayment(botId);
        } else {
            // Bot decide não pagar (aceita a morte, deixa o timer estourar)
            console.log(`Bot ${players[botId].name} aceitou a morte.`);
        }
    }, thinkingTime);
}

function eliminatePlayer(playerId) {
    if (players[playerId]) {
        players[playerId].status = 'dead';
        io.emit('player_eliminated', { 
            playerId: playerId, 
            playerName: players[playerId].name 
        });
        startEliminationRound();
    }
}

function resetGame() {
    players = {};
    gameStatus = 'waiting';
    io.emit('reset_game');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`SERVER RODANDO NA PORTA ${PORT}`);
});
