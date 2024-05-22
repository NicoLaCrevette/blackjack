const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let deck = [];
let dealer = { hand: [], score: 0, hidden: true };
let currentPlayerIndex = 0;

function initializeDeck() {
    const suits = ['c', 'd', 'h', 's'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    deck = [];

    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    deck = shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function calculateScore(hand) {
    let score = 0;
    let aces = 0;

    hand.forEach(card => {
        if (['J', 'Q', 'K'].includes(card.value)) {
            score += 10;
        } else if (card.value === 'A') {
            aces++;
            score += 11;
        } else {
            score += parseInt(card.value);
        }
    });

    while (score > 21 && aces) {
        score -= 10;
        aces--;
    }

    return score;
}

function allPlayersDone() {
    return players.every(player => player.result !== '');
}

io.on('connection', (socket) => {
    socket.on('joinGame', (playerName, initialAmount) => {
        if (players.find(p => p.id === socket.id)) {
            socket.emit('error', 'You have already joined the game.');
            return;
        }

        const player = {
            id: socket.id,
            name: playerName,
            hand: [],
            doubled: false,
            split: false,
            splitHand: [],
            score: 0,
            balance: initialAmount,
            bet: 0,
            result: '',
            hasBet: false
        };
        players.push(player);
        io.emit('updatePlayers', players);
        console.log(`Player ${playerName} joined with initial amount ${initialAmount}`);
    });

    socket.on('placeBet', (betAmount) => {
        const player = players.find(p => p.id === socket.id);
        if (player && betAmount <= player.balance && betAmount > 0) {
            player.bet = betAmount;
            player.balance -= betAmount;
            player.hasBet = true;
            io.to(socket.id).emit('betPlaced', player);
            io.emit('updatePlayers', players);
            console.log(`Player ${player.name} placed a bet of ${betAmount}`);
        } else {
            io.to(socket.id).emit('error', 'Invalid bet amount');
        }
    });

    socket.on('startRound', () => {
        if (players.every(player => player.hasBet)) {
            initializeDeck();
            players.forEach(player => {
                player.hand = [deck.pop(), deck.pop()];
                player.score = calculateScore(player.hand);
            });
            dealer.hand = [deck.pop(), deck.pop()];
            dealer.score = calculateScore(dealer.hand);
            dealer.hidden = true;
            currentPlayerIndex = 0;
            io.emit('dealCards', players, dealer);
            io.emit('highlightPlayer', players[currentPlayerIndex].id);
            io.to(players[currentPlayerIndex].id).emit('yourTurn');
            console.log('Round started');
        } else {
            io.emit('error', 'All players must place a bet to start the round');
        }
    });

    socket.on('hit', () => {
        const player = players.find(p => p.id === socket.id);
        if (player && players[currentPlayerIndex].id === socket.id) {
            player.hand.push(deck.pop());
            player.score = calculateScore(player.hand);
            io.emit('updatePlayer', player);
            console.log(`Player ${player.name} hits and their score is now ${player.score}`);
            if (player.score > 21) {
                player.result = 'lose';
                io.emit('playerBust', player);
                if (allPlayersDone()) {
                    dealerTurn();
                }
            } else {
                io.to(socket.id).emit('yourTurn');
            }
        }
    });

    socket.on('stand', () => {
        const player = players.find(p => p.id === socket.id);
        if (player && players[currentPlayerIndex].id === socket.id) {
            console.log(`Player ${players[currentPlayerIndex].name} stands`);
            player.result = 'stand';
            if (allPlayersDone()) {
                dealerTurn();
            }
        }
    });

    socket.on('double', () => {
        const player = players.find(p => p.id === socket.id);
        if (player && player.balance >= player.bet && players[currentPlayerIndex].id === socket.id) {
            player.balance -= player.bet;
            player.bet *= 2;
            player.hand.push(deck.pop());
            player.score = calculateScore(player.hand);
            player.doubled = true;
            io.emit('updatePlayer', player);
            console.log(`Player ${player.name} doubles their bet and their score is now ${player.score}`);
            if (player.score > 21) {
                player.result = 'lose';
                io.emit('playerBust', player);
            } else {
                player.result = 'stand';
            }
            if (allPlayersDone()) {
                dealerTurn();
            }
        } else {
            io.to(socket.id).emit('error', 'Not enough balance to double the bet');
        }
    });

    function dealerTurn() {
        console.log('Dealer turn starts');
        while (dealer.score < 17) {
            dealer.hand.push(deck.pop());
            dealer.score = calculateScore(dealer.hand);
            console.log(`Dealer draws a card. Score: ${dealer.score}`);
        }
        dealer.hidden = false;
        io.emit('dealerTurn', dealer);
        endRound();
    }

    function endRound() {
        players.forEach(player => {
            if (player.result !== 'win') {
                if (player.score > 21) {
                    player.result = 'lose';
                } else if (dealer.score > 21 || player.score > dealer.score) {
                    player.result = 'win';
                    player.balance += player.bet * 2;
                } else if (player.score < dealer.score) {
                    player.result = 'lose';
                } else {
                    player.result = 'tie';
                    player.balance += player.bet;
                }
            }
            io.to(player.id).emit('roundEnd', player, dealer);
        });
        players.forEach(player => {
            player.bet = 0; // Reset the bet for the next round
            player.hasBet = false; // Reset the bet status for the next round
        });
        io.emit('updatePlayers', players);
        console.log('Round ended');
    }

    socket.on('disconnect', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            console.log(`Player ${player.name} disconnected`);
        }
        players = players.filter(player => player.id !== socket.id);
        io.emit('updatePlayers', players);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
