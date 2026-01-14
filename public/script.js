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
const prizeDisplay = document.querySelector('.status-bar.green-text'); // Elemento do prêmio

let myId = null;
let countdownInterval;

// --- ACTIONS ---

function joinGame() {
    const name = document.getElementById('username').value;
    if (!name) return alert('DIGITE UM NOME!');
    
    initAudio(); 
    // Solicita permissão de vibração (em alguns browsers é auto, outros precisa de click)
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
    // Feedback tátil imediato ao clicar
    if (navigator.vibrate) navigator.vibrate(50);
    socket.emit('pay_revive'); 
}

function sendChat(msg) {
    socket.emit('send_chat', msg);
}

// --- VISUAL FX ---
function animatePrize() {
    prizeDisplay.style.transform = "scale(1.5)";
    prizeDisplay.style.color = "#fff";
    setTimeout(() => {
        prizeDisplay.style.transform = "scale(1)";
        prizeDisplay.style.color = "var(--neon-green)";
    }, 300);
}

// --- SOCKET EVENTS ---

socket.on('connect', () => { myId = socket.id; });
socket.on('error_msg', (msg) => { alert(msg); });

// Atualização Dinâmica do Prêmio
socket.on('update_prize', (amount) => {
    // Formata para R$
    const formatted = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    prizeDisplay.innerText = `PRÊMIO: ${formatted}`;
    
    // Se o jogo já começou, anima o crescimento do dinheiro
    if (!loginScreen.classList.contains('active')) {
        animatePrize();
        playCash(); // Som de moeda sempre que sobe
    }
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
        
        // Se estiver morto, adiciona icone de caveira
        if (p.status === 'dead') {
            div.innerHTML += ' ☠️';
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
        // É VOCÊ! VIBRA O CELULAR
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]); // Atenção

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
        
        // MODO PÂNICO (< 5s)
        if (timeLeft <= 5 && timeLeft > 0) {
            document.body.classList.add('panic-mode');
            countdownEl.classList.add('critical');
            
            // SE FOR VOCÊ, VIBRA FORTE NO RITMO
            if (data.targetId === myId && navigator.vibrate) {
                navigator.vibrate(200); // Treme a cada segundo
            }
        }
        
        if (timeLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
});

socket.on('payment_received', (data) => {
    clearInterval(countdownInterval);
    document.body.classList.remove('panic-mode'); 
    countdownEl.classList.remove('critical');
    
    // Som de dinheiro já toca no 'update_prize', então não duplicamos aqui
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
    
    // Vibração longa de morte (para todos sentirem o impacto)
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
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 500]); // Padrão de vitória
    } else {
        title.innerText = "GAME OVER"; title.style.color = "var(--neon-red)";
        msg.innerText = `${winner.name} levou ${finalPrize}.`;
    }
});

socket.on('reset_game', () => location.reload());
