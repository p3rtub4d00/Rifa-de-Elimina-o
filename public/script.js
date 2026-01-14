const socket = io();

// Elementos do DOM
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

let myId = null;
let countdownInterval;

// --- FUNÇÕES DE INTERAÇÃO ---

function joinGame() {
    const name = document.getElementById('username').value;
    if (!name) return alert('Digite um nome!');
    
    socket.emit('join_game', name);
    
    loginScreen.classList.remove('active');
    gameScreen.classList.add('active');
}

function startGame() {
    socket.emit('start_game_signal');
    document.getElementById('start-btn').classList.add('hidden');
}

function payToLive() {
    // Simula a compra
    socket.emit('pay_revive');
}

// --- SOCKET EVENTS ---

socket.on('connect', () => {
    myId = socket.id;
});

socket.on('error_msg', (msg) => {
    alert(msg);
    location.reload();
});

// Atualizar lista de jogadores
socket.on('update_players', (players) => {
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

// Jogo começou
socket.on('game_started', () => {
    statusText.innerText = "A ELIMINAÇÃO COMEÇOU!";
    statusText.style.color = "var(--neon-red)";
    dangerZone.classList.add('active');
    document.getElementById('start-btn').classList.add('hidden');
});

// Novo alvo definido
socket.on('new_target', (data) => {
    // Reset visual
    document.body.classList.remove('in-danger');
    payBtn.classList.add('hidden');
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('target'));
    
    // Highlight visual no grid
    const targetCard = document.getElementById(`player-${data.targetId}`);
    if (targetCard) targetCard.classList.add('target');

    targetNameEl.innerText = `ALVO: ${data.targetName}`;
    
    // Se EU sou o alvo
    if (data.targetId === myId) {
        document.body.classList.add('in-danger');
        instructionEl.innerText = "VOCÊ VAI SER ELIMINADO! PAGUE AGORA!";
        payBtn.classList.remove('hidden');
    } else {
        instructionEl.innerText = `${data.targetName} está na mira...`;
    }

    // Timer Frontend
    let timeLeft = data.timeLeft;
    countdownEl.innerText = timeLeft;
    clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        countdownEl.innerText = timeLeft;
        if (timeLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
});

// Pagamento recebido
socket.on('payment_received', (data) => {
    clearInterval(countdownInterval);
    instructionEl.innerText = `${data.player} PAGOU E SOBREVIVEU!`;
    instructionEl.style.color = "var(--neon-green)";
    setTimeout(() => { instructionEl.style.color = ""; }, 1000);
});

// Jogador eliminado
socket.on('player_eliminated', (data) => {
    clearInterval(countdownInterval);
    instructionEl.innerText = `${data.playerName} FOI ELIMINADO!`;
    document.body.classList.remove('in-danger');
    payBtn.classList.add('hidden');
});

// Fim de jogo
socket.on('game_over', (winner) => {
    gameScreen.classList.remove('active');
    resultScreen.classList.add('active');
    
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');

    if (winner.id === myId) {
        title.innerText = "VOCÊ VENCEU!";
        title.style.color = "var(--neon-green)";
        msg.innerText = "O prêmio é todo seu.";
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "var(--neon-red)";
        msg.innerText = `${winner.name} venceu a partida.`;
    }
});

socket.on('reset_game', () => {
    location.reload();
});
