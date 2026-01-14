const socket = io();

// DOM Elements
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

// --- ACTIONS ---

function joinGame() {
    const name = document.getElementById('username').value;
    if (!name) return alert('DIGITE UM NOME!');
    
    // INICIAR O AUDIO CONTEXT (Necessário interação do usuário)
    initAudio(); 
    
    socket.emit('join_game', name);
    loginScreen.classList.remove('active');
    gameScreen.classList.add('active');
}

function addBots(qtd) {
    socket.emit('add_bots', qtd);
}

function startGame() {
    socket.emit('start_game_signal');
    document.getElementById('admin-game-controls').classList.add('hidden');
}

function payToLive() {
    socket.emit('pay_revive');
}

// --- SOCKET LISTENERS ---

socket.on('connect', () => { myId = socket.id; });
socket.on('error_msg', (msg) => { alert(msg); });

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

socket.on('game_started', () => {
    statusText.innerText = "SOBREVIVÊNCIA INICIADA";
    statusText.style.color = "var(--neon-red)";
    dangerZone.classList.add('hidden'); 
    document.getElementById('admin-game-controls').classList.add('hidden');
});

socket.on('new_target', (data) => {
    // Reset Visual e Audio
    document.body.classList.remove('in-danger');
    document.body.classList.remove('panic-mode'); 
    countdownEl.classList.remove('critical');
    
    payBtn.classList.add('hidden');
    dangerZone.classList.remove('hidden');
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('target'));
    
    // Som de Alarme
    playAlarm();

    // Highlight Target
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

    // Timer
    let timeLeft = data.timeLeft;
    countdownEl.innerText = timeLeft;
    clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        countdownEl.innerText = timeLeft;

        // EFEITOS DE TENSÃO
        if (timeLeft > 0) {
             playTick(timeLeft); // Toca o bip
        }
        
        // Se faltar 5 segundos, ativa o MODO PÂNICO
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
    
    // Som de Dinheiro
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

    // Som de Morte
    playDeath();

    instructionEl.innerText = `${data.playerName} FOI ELIMINADO.`;
    instructionEl.style.color = "var(--neon-red)";
    payBtn.classList.add('hidden');
    document.body.classList.remove('in-danger');
});

socket.on('game_over', (winner) => {
    gameScreen.classList.remove('active');
    resultScreen.classList.add('active');
    playCash(); // Som de vitória
    
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');

    if (winner.id === myId) {
        title.innerText = "VITÓRIA";
        title.style.color = "var(--neon-green)";
        msg.innerText = "O dinheiro é seu.";
    } else {
        title.innerText = "GAME OVER";
        title.style.color = "var(--neon-red)";
        msg.innerText = `${winner.name} levou tudo.`;
    }
});

socket.on('reset_game', () => location.reload());
