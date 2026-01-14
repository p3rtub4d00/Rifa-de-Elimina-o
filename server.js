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
const STARTING_PRIZE = 500.00;
const PAY_PRICE = 2.00;
const CHANCE_TO_GET_ITEM = 0.3; // 30% de chance de ganhar item ao pagar

// Itens Disponíveis
const ITEMS = ['FREEZE', 'SKIP']; // Freeze: Congela inimigo / Skip: Passa a batata quente

const BOT_NAMES = [
    "Ghost_Rider", "Killer007", "Viper_X", "Titan_Br", "ShadowHunter",
    "Neon_Wolf", "CyberPunk", "Rich_Kid", "NoobMaster", "Pro_Gamer",
    "Alpha_Male", "Dona_Morte", "Sniper_Elite", "00_Dinheiro", "Rico_Suave"
];

const BOT_MESSAGES = {
    pay: ["Ufa!", "Quase...", "Tô liso", "Mais uma", "Vivos?", "Aumenta o pote!"],
    laugh: ["KKKKK", "Já era", "Adeus!", "F", "Bye Bye", "Menos um", "Toma gelo!"],
    taunt: ["Paga logo!", "Vai morrer", "Tic Tac", "Medo?", "Sua vez", "Usa o item!"]
};

// --- ESTADO DO JOGO ---
let players = {}; 
let gameStatus = 'waiting'; 
let eliminationTimer = null;
let currentTargetId = null;
let botDecisionTimer = null;
let currentPrize = STARTING_PRIZE;

// Efeitos ativos
let freezeActive = false; // Se true, o botão do alvo atual está travado

io.on('connection', (socket) => {
    // ... (Mantém o código de conexão anterior) ...
    socket.emit('update_prize', currentPrize);

    socket.on('join_game', (playerName) => {
        if (gameStatus !== 'waiting') {
            socket.emit('error_msg', 'Jogo em andamento.');
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
        currentPrize = STARTING_PRIZE;
        io.emit('game_started');
        io.emit('update_prize', currentPrize);
        startEliminationRound();
    });

    socket.on('pay_revive', () => {
        // Se estiver congelado, ignora o clique
        if (freezeActive && socket.id === currentTargetId) return; 
        
        if (gameStatus !== 'active' || socket.id !== currentTargetId) return;
        processPayment(socket.id);
    });

    // NOVO: USAR ITEM
    socket.on('use_item', (itemType) => {
        const p = players[socket.id];
        if (!p || p.status !== 'alive' || !p.items.includes(itemType)) return;

        // Remove item do inventário
        const index = p.items.indexOf(itemType);
        p.items.splice(index, 1);
        io.emit('update_inventory', { playerId: socket.id, items: p.items });

        // Aplica efeito
        if (itemType === 'FREEZE') {
            // Congela o ATUAL alvo (só funciona se não for você mesmo, ou estratégia suicida)
            if (currentTargetId && currentTargetId !== socket.id) {
                freezeActive = true;
                io.emit('effect_freeze', { targetId: currentTargetId, attacker: p.name });
                // Descongela após 3s
                setTimeout(() => {
                    freezeActive = false;
                    io.emit('effect_unfreeze');
                }, 3000);
            }
        } else if (itemType === 'SKIP') {
            // Se você for o alvo, passa a vez instantaneamente sem pagar (mas não aumenta o prêmio)
            if (currentTargetId === socket.id) {
                clearTimeout(eliminationTimer);
                clearTimeout(botDecisionTimer);
                io.emit('chat_message', { playerId: socket.id, text: "USEI SKIP! TCHAU!" });
                setTimeout(() => startEliminationRound(), 500);
            }
        }
    });

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
        items: [], // Inventário vazio
        avatar: Math.floor(Math.random() * 5) + 1
    };
    io.emit('update_players', Object.values(players));
}

function processPayment(playerId) {
    clearTimeout(eliminationTimer);
    clearTimeout(botDecisionTimer);
    freezeActive = false; // Garante que tira o gelo

    currentPrize += PAY_PRICE;
    io.emit('update_prize', currentPrize);
    io.emit('payment_received', { player: players[playerId].name });

    // Lógica de Ganhar Item (Drop)
    if (Math.random() < CHANCE_TO_GET_ITEM) {
        const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
        players[playerId].items.push(item);
        io.emit('update_inventory', { playerId: playerId, items: players[playerId].items });
        io.emit('chat_message', { playerId: playerId, text: `Ganhei ${item}!` });
    }

    if (players[playerId].isBot && Math.random() < 0.3) {
        botSay(playerId, 'pay');
    }

    setTimeout(() => { startEliminationRound(); }, 1500);
}

function startEliminationRound() {
    freezeActive = false; // Reset status
    io.emit('effect_unfreeze');

    const alivePlayers = Object.values(players).filter(p => p.status === 'alive');
    
    if (alivePlayers.length === 1) {
        gameStatus = 'ended';
        io.emit('game_over', { winner: alivePlayers[0], prize: currentPrize });
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

    eliminationTimer = setTimeout(() => { eliminatePlayer(victim.id); }, TIME_TO_DIE * 1000);

    if (victim.isBot) { handleBotTurn(victim.id); }
}

function handleBotTurn(botId) {
    const thinkingTime = Math.floor(Math.random() * (TIME_TO_DIE - 4) + 3) * 1000;
    
    // Bots também podem usar itens (Simplificado: bot não usa item por enquanto para não ficar muito difícil, mas ganha itens)
    
    botDecisionTimer = setTimeout(() => {
        if (gameStatus !== 'active' || currentTargetId !== botId) return;
        
        // Se bot estiver congelado, ele morre
        if (freezeActive) return; 

        if (Math.random() < BOT_SURVIVAL_CHANCE) {
            processPayment(botId);
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

function botSay(botId, category) {
    const msgs = BOT_MESSAGES[category];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    io.emit('chat_message', { playerId: botId, text: msg });
}

function resetGame() {
    players = {};
    gameStatus = 'waiting';
    currentPrize = STARTING_PRIZE;
    freezeActive = false;
    io.emit('reset_game');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`SERVER RODANDO NA PORTA ${PORT}`); });
