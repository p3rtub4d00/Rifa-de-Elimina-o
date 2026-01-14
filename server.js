const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- CONFIGURAÇÃO ---
const TIME_TO_DIE = 15;
const BOT_SURVIVAL_CHANCE = 0.85; 
const BOT_NAMES = [
    "Ghost_Rider", "Killer007", "Viper_X", "Titan_Br", "ShadowHunter",
    "Neon_Wolf", "CyberPunk", "Rich_Kid", "NoobMaster", "Pro_Gamer",
    "Alpha_Male", "Dona_Morte", "Sniper_Elite", "00_Dinheiro", "Rico_Suave"
];

// Mensagens que os bots usam
const BOT_MESSAGES = {
    pay: ["Ufa!", "Quase...", "Tô liso", "Mais uma", "Vivos?"],
    laugh: ["KKKKK", "Já era", "Adeus!", "F", "Bye Bye"],
    taunt: ["Paga logo!", "Vai morrer", "Tic Tac", "Medo?", "Sua vez"]
};

// --- ESTADO DO JOGO ---
let players = {}; 
let gameStatus = 'waiting'; 
let eliminationTimer = null;
let currentTargetId = null;
let botDecisionTimer = null;

// --- LOGICA DO SERVIDOR ---
io.on('connection', (socket) => {
    console.log('Conexão:', socket.id);

    socket.on('join_game', (playerName) => {
        if (gameStatus !== 'waiting') {
            socket.emit('error_msg', 'Jogo em andamento. Aguarde.');
            return;
        }
        addPlayer(socket.id, playerName, false);
    });

    socket.on('add_bots', (quantity) => {
        for (let i = 0; i < quantity; i++) {
            const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
            const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            addPlayer(botId, botName, true);
        }
    });

    socket.on('start_game_signal', () => {
        const aliveCount = Object.values(players).filter(p => p.status === 'alive').length;
        if (aliveCount < 2) return io.emit('error_msg', 'Mínimo 2 jogadores!');
        gameStatus = 'active';
        io.emit('game_started');
        startEliminationRound();
    });

    socket.on('pay_revive', () => {
        if (gameStatus !== 'active' || socket.id !== currentTargetId) return;
        processPayment(socket.id);
    });

    // NOVO: Receber Chat do Jogador
    socket.on('send_chat', (msg) => {
        if (players[socket.id] && players[socket.id].status === 'alive') {
            io.emit('chat_message', { playerId: socket.id, text: msg });
        }
    });

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
    clearTimeout(eliminationTimer);
    clearTimeout(botDecisionTimer);
    io.emit('payment_received', { player: players[playerId].name });
    
    // Bot fala algo quando paga (chance 30%)
    if (players[playerId].isBot && Math.random() < 0.3) {
        botSay(playerId, 'pay');
    }

    setTimeout(() => { startEliminationRound(); }, 1500);
}

function startEliminationRound() {
    const alivePlayers = Object.values(players).filter(p => p.status === 'alive');
    
    if (alivePlayers.length === 1) {
        gameStatus = 'ended';
        io.emit('game_over', alivePlayers[0]);
        setTimeout(resetGame, 8000);
        return;
    }
    if (alivePlayers.length === 0) { resetGame(); return; }

    let candidates = alivePlayers;
    if (alivePlayers.length > 2 && currentTargetId) {
        candidates = alivePlayers.filter(p => p.id !== currentTargetId);
    }
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    currentTargetId = victim.id;

    io.emit('new_target', { 
        targetId: victim.id, 
        targetName: victim.name,
        timeLeft: TIME_TO_DIE 
    });

    // Bots provocam o alvo (chance 20% para cada bot vivo)
    alivePlayers.forEach(p => {
        if (p.isBot && p.id !== victim.id && Math.random() < 0.2) {
            setTimeout(() => botSay(p.id, 'taunt'), Math.random() * 2000);
        }
    });

    eliminationTimer = setTimeout(() => { eliminatePlayer(victim.id); }, TIME_TO_DIE * 1000);

    if (victim.isBot) { handleBotTurn(victim.id); }
}

function handleBotTurn(botId) {
    const thinkingTime = Math.floor(Math.random() * (TIME_TO_DIE - 4) + 3) * 1000;
    botDecisionTimer = setTimeout(() => {
        if (gameStatus !== 'active' || currentTargetId !== botId) return;
        if (Math.random() < BOT_SURVIVAL_CHANCE) {
            processPayment(botId);
        } else {
            // Bot aceita a morte
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
        
        // Bots riem do morto (chance 40%)
        Object.values(players).forEach(p => {
            if (p.isBot && p.status === 'alive' && Math.random() < 0.4) {
                setTimeout(() => botSay(p.id, 'laugh'), Math.random() * 2000);
            }
        });

        startEliminationRound();
    }
}

// Faz um bot falar uma frase da categoria
function botSay(botId, category) {
    const msgs = BOT_MESSAGES[category];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    io.emit('chat_message', { playerId: botId, text: msg });
}

function resetGame() {
    players = {};
    gameStatus = 'waiting';
    io.emit('reset_game');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`SERVER RODANDO NA PORTA ${PORT}`); });
