const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let players = [];
let deck = [];
let dealer = { hand: [], score: 0, hidden: true };

function initializeDeck() {
    const suits = ['h', 'd', 'c', 's'];
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

io.on('connection', (socket) => {
    socket.on('joinGame', (playerName, initialAmount) => {
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
            result: ''
        };
        players.push(player);
        io.emit('updatePlayers', players);
    });

    socket.on('startRound', () => {
        initializeDeck();
        players.forEach(player => {
            player.hand = [deck.pop(), deck.pop()];
            player.score = calculateScore(player.hand);
        });
        dealer.hand = [deck.pop(), deck.pop()];
        dealer.score = calculateScore(dealer.hand);
        io.emit('dealCards', players, dealer);
    });

    socket.on('hit', (playerId) => {
        const player = players.find(p => p.id === playerId);
        player.hand.push(deck.pop());
        player.score = calculateScore(player.hand);
        io.emit('updatePlayer', player);
        if (player.score > 21) {
            player.result = 'lose';
            io.emit('playerBust', player);
        }
    });

    socket.on('stand', (playerId) => {
        const playerIndex = players.findIndex(p => p.id === playerId);
        if (playerIndex >= 0 && playerIndex < players.length - 1) {
            io.emit('nextPlayer', players[playerIndex + 1].id);
        } else {
            dealerTurn();
        }
    });

    function dealerTurn() {
        while (dealer.score < 17) {
            dealer.hand.push(deck.pop());
            dealer.score = calculateScore(dealer.hand);
        }
        io.emit('dealerTurn', dealer);
        endRound();
    }

    function endRound() {
        players.forEach(player => {
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
        });
        io.emit('endRound', players, dealer);
    }

    socket.on('disconnect', () => {
        players = players.filter(player => player.id !== socket.id);
        io.emit('updatePlayers', players);
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log('Server is running');
});

app.use(express.static('public'));

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
