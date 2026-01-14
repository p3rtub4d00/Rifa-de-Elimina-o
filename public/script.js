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

let myId = null;
let countdownInterval;

// --- ACTIONS ---

function joinGame() {
    const name = document.getElementById('username').value;
    if (!name) return alert('DIGITE UM NOME!');
    initAudio(); 
    socket.emit('join_game', name);
    loginScreen.classList.remove('active');
    gameScreen.classList.add('active');
}

function addBots(qtd) { socket.emit('add_bots', qtd); }

function startGame() {
    socket.emit('start_game_signal');
    document.getElementById('admin-game-controls').classList.add('hidden');
}

function payToLive() { socket.emit('pay_revive'); }

function sendChat(msg) {
    socket.emit('send_chat', msg);
    // Tocar um som sutil de clique (opcional)
}

// --- SOCKET EVENTS ---

socket.on('connect', () => { myId = socket.id; });
socket.on('error_msg', (msg) => { alert(msg); });

socket.on('update_players', (players) => {
    // Para não redesenhar tudo e perder os balões de chat, verificamos se mudou
    // Mas para este MVP, vamos redesenhar e manter chat separado se possível.
    // Simplificação: Redesenha, mas se tiver chat ativo, perdemos (ok para MVP)
    playersList.innerHTML = '';
    let aliveCount = 0;
    players.forEach(p => {
        if (p.status === 'alive') aliveCount++;
        const div = document.createElement('div');
        div.className = `player-card ${p.status}`;
        div.id = `player-${p.id}`;
        div.innerText = p.name + (p.id === myId ? ' (VOCÊ)' : '');
        playersList.appendChild(div);
    });
    aliveCountEl.innerText = aliveCount;
});

socket.on('chat_message', (data) => {
    const playerCard = document.getElementById(`player-${data.playerId}`);
    if (playerCard) {
        // Cria balão
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.innerText = data.text;
        playerCard.appendChild(bubble);

        // Remove após 3 segundos
        setTimeout(() => {
            if (playerCard.contains(bubble)) {
                playerCard.removeChild(bubble);
            }
        }, 3000);
    }
});

socket.on('game_started', () => {
    statusText.innerText = "SOBREVIVÊNCIA INICIADA";
    statusText.style.color = "var(--neon-red)";
    dangerZone.classList.add('hidden'); 
    document.getElementById('admin-game-controls').classList.add('hidden');
    chatBar.classList.remove('hidden'); // Mostra chat
});

socket.on('new_target', (data) => {
    document.body.classList.remove('in-danger');
    document.body.classList.remove('panic-mode'); 
    countdownEl.classList.remove('critical');
    payBtn.classList.add('hidden');
    dangerZone.classList.remove('hidden');
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('target'));
    
    playAlarm();

    const targetCard = document.getElementById(`player-${data.targetId}`);
    if (targetCard) targetCard.classList.add('target');

    targetNameEl.innerText = `ALVO: ${data.targetName}`;
    
    if (data.targetId === myId) {
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
        }
        if (timeLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
});

socket.on('payment_received', (data) => {
    clearInterval(countdownInterval);
    document.body.classList.remove('panic-mode'); 
    countdownEl.classList.remove('critical');
    playCash();
    instructionEl.innerText = `${data.player} PAGOU E SOBREVIVEU.`;
    instructionEl.style.color = "var(--neon-green)";
    payBtn.classList.add('hidden');
    document.body.classList.remove('in-danger');
});

socket.on('player_eliminated', (data) => {
    clearInterval(countdownInterval);
    document.body.classList.remove('panic-mode');
    countdownEl.classList.remove('critical');
    playDeath();
    instructionEl.innerText = `${data.playerName} FOI ELIMINADO.`;
    instructionEl.style.color = "var(--neon-red)";
    payBtn.classList.add('hidden');
    document.body.classList.remove('in-danger');
});

socket.on('game_over', (winner) => {
    gameScreen.classList.remove('active');
    resultScreen.classList.add('active');
    playCash();
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    if (winner.id === myId) {
        title.innerText = "VITÓRIA"; title.style.color = "var(--neon-green)";
        msg.innerText = "O dinheiro é seu.";
    } else {
        title.innerText = "GAME OVER"; title.style.color = "var(--neon-red)";
        msg.innerText = `${winner.name} levou tudo.`;
    }
});

socket.on('reset_game', () => location.reload());
