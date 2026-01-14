const socket = io();

// Elementos
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');
const playersList = document.getElementById('players-list');
const dangerZone = document.getElementById('danger-zone');
const targetNameEl = document.getElementById('target-name');
const countdownEl = document.getElementById('countdown');
const instructionEl = document.getElementById('instruction-text');
const payBtn = document.getElementById('pay-btn');
const aliveCountEl = document.getElementById('alive-count');
const statusText = document.getElementById('game-status-text');
const chatBar = document.getElementById('chat-bar');
const prizeDisplay = document.querySelector('.status-bar.green-text');
const inventoryBar = document.getElementById('inventory-bar');
const freezeOverlay = document.getElementById('freeze-overlay');

let myId = null;
let countdownInterval;

// --- ACTIONS ---
function joinGame() {
    const name = document.getElementById('username').value;
    if (!name) return alert('DIGITE UM NOME!');
    initAudio(); 
    if (navigator.vibrate) navigator.vibrate(50);
    socket.emit('join_game', name);
    loginScreen.classList.remove('active');
    gameScreen.classList.add('active');
}
function addBots(qtd) { socket.emit('add_bots', qtd); }
function startGame() {
    socket.emit('start_game_signal');
    document.getElementById('admin-game-controls').classList.add('hidden');
}
function payToLive() { 
    if (payBtn.classList.contains('frozen')) return; // Bloqueia clique
    if (navigator.vibrate) navigator.vibrate(50);
    socket.emit('pay_revive'); 
}
function sendChat(msg) { socket.emit('send_chat', msg); }
function useItem(item) { socket.emit('use_item', item); }

function animatePrize() {
    prizeDisplay.style.transform = "scale(1.5)";
    prizeDisplay.style.color = "#fff";
    setTimeout(() => { prizeDisplay.style.transform = "scale(1)"; prizeDisplay.style.color = "var(--neon-green)"; }, 300);
}

// --- SOCKET EVENTS ---
socket.on('connect', () => { myId = socket.id; });
socket.on('error_msg', (msg) => { alert(msg); });

// INVENTÁRIO
socket.on('update_inventory', (data) => {
    if (data.playerId !== myId) return;
    inventoryBar.innerHTML = ''; // Limpa e redesenha
    data.items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = `item-btn ${item.toLowerCase()}`;
        if (item === 'FREEZE') {
            btn.innerText = "❄️ CONGELAR";
            btn.onclick = () => useItem('FREEZE');
        } else if (item === 'SKIP') {
            btn.innerText = "⏩ PULAR VEZ";
            btn.onclick = () => useItem('SKIP');
        }
        inventoryBar.appendChild(btn);
    });
});

// EFEITO GELO
socket.on('effect_freeze', (data) => {
    // Se EU sou o alvo, minha tela congela
    if (data.targetId === myId) {
        freezeOverlay.classList.remove('hidden');
        payBtn.classList.add('frozen');
        instructionEl.innerText = `VOCÊ FOI CONGELADO POR ${data.attacker}!`;
        if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50, 50]); // Vibração chata
    }
});

socket.on('effect_unfreeze', () => {
    freezeOverlay.classList.add('hidden');
    payBtn.classList.remove('frozen');
});

socket.on('update_prize', (amount) => {
    const formatted = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    prizeDisplay.innerText = `PRÊMIO: ${formatted}`;
    if (!loginScreen.classList.contains('active')) { animatePrize(); playCash(); }
});

socket.on('update_players', (players) => {
    playersList.innerHTML = '';
    let aliveCount = 0;
    players.forEach(p => {
        if (p.status === 'alive') aliveCount++;
        const div = document.createElement('div');
        div.className = `player-card ${p.status}`;
        div.id = `player-${p.id}`;
        div.innerText = p.name + (p.id === myId ? ' (VOCÊ)' : '');
        // Ícone de itens que o jogador tem (opcional, mostra que ele está perigoso)
        if (p.items && p.items.length > 0) {
            div.innerText += ` [${p.items.length}📦]`;
        }
        playersList.appendChild(div);
    });
    aliveCountEl.innerText = aliveCount;
});

socket.on('chat_message', (data) => {
    const playerCard = document.getElementById(`player-${data.playerId}`);
    if (playerCard) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.innerText = data.text;
        playerCard.appendChild(bubble);
        setTimeout(() => { if(playerCard.contains(bubble)) playerCard.removeChild(bubble); }, 3000);
    }
});

socket.on('game_started', () => {
    statusText.innerText = "SOBREVIVÊNCIA INICIADA";
    statusText.style.color = "var(--neon-red)";
    dangerZone.classList.add('hidden'); 
    document.getElementById('admin-game-controls').classList.add('hidden');
    chatBar.classList.remove('hidden');
    inventoryBar.innerHTML = ''; // Reseta itens visualmente
});

socket.on('new_target', (data) => {
    document.body.classList.remove('in-danger');
    document.body.classList.remove('panic-mode'); 
    countdownEl.classList.remove('critical');
    payBtn.classList.add('hidden');
    dangerZone.classList.remove('hidden');
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('target'));
    
    // Reseta status de gelo visual caso tenha bugado
    freezeOverlay.classList.add('hidden');
    payBtn.classList.remove('frozen');
    
    playAlarm();

    const targetCard = document.getElementById(`player-${data.targetId}`);
    if (targetCard) targetCard.classList.add('target');

    targetNameEl.innerText = `ALVO: ${data.targetName}`;
    
    if (data.targetId === myId) {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        document.body.classList.add('in-danger');
        instructionEl.innerText = "VOCÊ VAI MORRER! PAGUE AGORA!";
        instructionEl.style.color = "var(--neon-red)";
        payBtn.classList.remove('hidden');
    } else {
        instructionEl.innerText = `${data.targetName} está decidindo...`;
        instructionEl.style.color = "#888";
    }

    let timeLeft = data.timeLeft;
    countdownEl.innerText = timeLeft;
    clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        countdownEl.innerText = timeLeft;
        if (timeLeft > 0) playTick(timeLeft);
        if (timeLeft <= 5 && timeLeft > 0) {
            document.body.classList.add('panic-mode');
            countdownEl.classList.add('critical');
            if (data.targetId === myId && navigator.vibrate) navigator.vibrate(200);
        }
        if (timeLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
});

socket.on('payment_received', (data) => {
    clearInterval(countdownInterval);
    document.body.classList.remove('panic-mode'); 
    countdownEl.classList.remove('critical');
    instructionEl.innerText = `${data.player} PAGOU E SOBREVIVEU.`;
    instructionEl.style.color = "var(--neon-green)";
    payBtn.classList.add('hidden');
    document.body.classList.remove('in-danger');
});

socket.on('player_eliminated', (data) => {
    clearInterval(countdownInterval);
    document.body.classList.remove('panic-mode');
    playDeath();
    if (navigator.vibrate) navigator.vibrate(500);
    instructionEl.innerText = `${data.playerName} FOI ELIMINADO.`;
    instructionEl.style.color = "var(--neon-red)";
    payBtn.classList.add('hidden');
    document.body.classList.remove('in-danger');
});

socket.on('game_over', (data) => {
    const winner = data.winner;
    const finalPrize = data.prize.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    gameScreen.classList.remove('active');
    resultScreen.classList.add('active');
    playCash();
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    if (winner.id === myId) {
        title.innerText = "VITÓRIA"; title.style.color = "var(--neon-green)";
        msg.innerHTML = `Você levou <br><span style="font-size:2rem">${finalPrize}</span>`;
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 500]);
    } else {
        title.innerText = "GAME OVER"; title.style.color = "var(--neon-red)";
        msg.innerText = `${winner.name} levou ${finalPrize}.`;
    }
});

socket.on('reset_game', () => location.reload());
