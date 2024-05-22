const socket = io();
let playerId;

function joinGame() {
    const playerName = document.getElementById('playerName').value;
    const initialAmount = parseInt(document.getElementById('initialAmount').value);
    socket.emit('joinGame', playerName, initialAmount);
    document.getElementById('setup').classList.add('hidden');
    document.getElementById('betting').classList.remove('hidden');
}

socket.on('updatePlayers', (players) => {
    const bettingPlayersDiv = document.getElementById('bettingPlayers');
    bettingPlayersDiv.innerHTML = '';
    players.forEach(player => {
        bettingPlayersDiv.innerHTML += `
            <div>
                <h3>${player.name} - Balance: €<span id="balance_${player.id}">${player.balance}</span></h3>
                <label for="bet_${player.id}">Mise (€) :</label>
                <input type="number" id="bet_${player.id}" min="1" max="${player.balance}" ${player.id === socket.id ? '' : 'disabled'}>
                <button onclick="placeBet('${player.id}')" ${player.id === socket.id ? '' : 'disabled'}>Placer la mise</button>
                <span id="bet_status_${player.id}" class="${player.hasBet ? 'ready' : ''}">${player.hasBet ? 'Prêt' : ''}</span>
            </div>
        `;
    });
    updateRemainingPlayersCount();
});

function placeBet(playerId) {
    const betAmount = parseInt(document.getElementById(`bet_${playerId}`).value);
    socket.emit('placeBet', betAmount);
}

socket.on('betPlaced', (player) => {
    document.getElementById(`balance_${player.id}`).innerText = player.balance;
    document.getElementById(`bet_status_${player.id}`).innerText = 'Prêt';
    document.getElementById(`bet_status_${player.id}`).classList.add('ready');
    updateRemainingPlayersCount();
});

socket.on('error', (message) => {
    alert(message);
});

function startRound() {
    socket.emit('startRound');
}

socket.on('dealCards', (players, dealer) => {
    document.getElementById('betting').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
    
    const dealerDiv = document.getElementById('dealer');
    dealerDiv.innerHTML = `<h2>Croupier - Score: ${dealer.hidden ? '?' : dealer.score}</h2>`;
    const handDiv = document.createElement('div');
    handDiv.classList.add('hand');
    dealer.hand.forEach((card, index) => {
        if (index === 1 && dealer.hidden) {
            handDiv.innerHTML += `<div class="card hidden-card"></div>`;
        } else {
            handDiv.innerHTML += `<div class="card" style="background-image: url('images/${card.value}${card.suit}.gif');"></div>`;
        }
    });
    dealerDiv.appendChild(handDiv);

    const playersDiv = document.getElementById('players');
    playersDiv.innerHTML = '';
    players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('player');
        playerDiv.innerHTML += `<h2>${player.name} - Score: ${player.score} - Mise: €${player.bet} <span id="result_${index}" class="result">${player.result}</span></h2>`;
        const handDiv = document.createElement('div');
        handDiv.classList.add('hand');
        player.hand.forEach(card => {
            handDiv.innerHTML += `<div class="card" style="background-image: url('images/${card.value}${card.suit}.gif');"></div>`;
        });
        playerDiv.appendChild(handDiv);

        playerDiv.id = `player_${player.id}`;

        if (player.id === socket.id && player.result !== 'blackjack') {
            playerDiv.innerHTML += `
                <button id="hit" onclick="hit()">Tirer</button>
                <button id="stand" onclick="stand()">Rester</button>
                <button id="double" onclick="double()">Doubler</button>
            `;
        } else {
            playerDiv.querySelectorAll('button').forEach(button => {
                button.style.display = 'none';
            });
        }

        playersDiv.appendChild(playerDiv);
    });

    updateRemainingPlayersCount();
});

function updateRemainingPlayersCount() {
    const remainingPlayers = document.querySelectorAll('#players .player button').length / 3;
    document.getElementById('remainingPlayersCount').innerText = remainingPlayers;
}

socket.on('updatePlayer', (player) => {
    const playerDiv = document.getElementById(`player_${player.id}`);
    if (playerDiv) {
        const handDiv = playerDiv.querySelector('.hand');
        handDiv.innerHTML = '';
        player.hand.forEach(card => {
            handDiv.innerHTML += `<div class="card" style="background-image: url('images/${card.value}${card.suit}.gif');"></div>`;
        });
        playerDiv.querySelector('h2').innerText = `${player.name} - Score: ${player.score} - Mise: €${player.bet}`;
    }
    updateRemainingPlayersCount();
});

socket.on('playerBust', (player) => {
    const playerDiv = document.getElementById(`player_${player.id}`);
    if (playerDiv) {
        playerDiv.querySelector('.result').innerText = 'Perdu';
        playerDiv.querySelector('.result').classList.add('lose');
    }
    updateRemainingPlayersCount();
});

socket.on('dealerTurn', async (dealer) => {
    const dealerDiv = document.getElementById('dealer');
    dealerDiv.innerHTML = `<h2>Croupier - Score: ${dealer.score}</h2>`;
    const handDiv = dealerDiv.querySelector('.hand');
    handDiv.innerHTML = '';
    for (let card of dealer.hand) {
        handDiv.innerHTML += `<div class="card" style="background-image: url('images/${card.value}${card.suit}.gif');"></div>`;
        await delay(2000);
    }
});

socket.on('endRound', (players, dealer) => {
    players.forEach((player, index) => {
        const resultSpan = document.getElementById(`result_${index}`);
        if (player.result === 'win') {
            resultSpan.innerText = 'Gagné';
            resultSpan.classList.add('win');
        } else if (player.result === 'lose') {
            resultSpan.innerText = 'Perdu';
            resultSpan.classList.add('lose');
        } else if (player.result === 'blackjack') {
            resultSpan.innerText = 'Blackjack!';
            resultSpan.classList.add('win');
        } else {
            resultSpan.innerText = 'Égalité';
            resultSpan.classList.add('tie');
        }
    });
    document.getElementById('remainingPlayersCount').innerText = '0';
    document.getElementById('ding-sound').play();
});

socket.on('clearResults', () => {
    document.querySelectorAll('.result').forEach(resultSpan => {
        resultSpan.innerText = '';
        resultSpan.classList.remove('win', 'lose', 'tie');
    });
});

function hit() {
    console.log('Hit button clicked');
    socket.emit('hit');
}

function stand() {
    console.log('Stand button clicked');
    socket.emit('stand');
    document.querySelectorAll('.player button').forEach(button => {
        button.style.display = 'none';
    });
}

function double() {
    console.log('Double button clicked');
    socket.emit('double');
    document.querySelectorAll('.player button').forEach(button => {
        button.style.display = 'none';
    });
}

function adjustVolume(value) {
    document.getElementById('background-music').volume = value / 100;
}

function toggleMusic() {
    const music = document.getElementById('background-music');
    if (music.paused) {
        music.play();
    } else {
        music.pause();
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
