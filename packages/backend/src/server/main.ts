import "@alterior/platform-nodejs";

import { Application } from '@alterior/runtime';
import { WebService, WebServerEngine, Get, WebEvent, WebServer } from '@alterior/web-server';
import * as webrpc from '@astronautlabs/webrpc';
import { RPCSession, SocketChannel } from '@astronautlabs/webrpc';
import * as Interface from '../common';
import { v4 as uuid } from 'uuid';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import * as fs from 'fs';
import path from 'path';
import { ExpressEngine } from '@alterior/express';

WebServerEngine.default = ExpressEngine;

export interface CardSet {
    name: string;
    description: string;
    official: boolean;
    white: WhiteCard[];
    black: BlackCard[];
}

export interface WhiteCard {
    id: string;
    deckId: string;
    text: string;
    pack: number;
}

export interface BlackCard {
    id: string;
    deckId: string;
    text: string;
    pick: number;
    pack: number;
}

export class PlayerSession extends Interface.PlayerSession {
    constructor(readonly session: Game, readonly player: Interface.Player) {
        super();
    }

    private connections = [];
    private leftTimeout;
    addConnection(session: RPCSession) {
        this.connections.push(session);

        clearTimeout(this.leftTimeout);

        (session.channel as SocketChannel).socket.addEventListener('close', () => {
            this.connections = this.connections.filter(x => x !== session);
            if (this.connections.length === 0) {
                this.leftTimeout = setTimeout(() => {
                    console.log(`Player ${this.player.id} has timed out.`);
                    this.session.removePlayer(this);
                }, 1000 * 30);
            }
        });
    }

    private _judgementRequested = new Subject<Interface.JudgementRequest>();
    private _judgementRequested$ = this._judgementRequested.asObservable();
    private _cardsChanged = new Subject<Interface.AnswerCard[]>();
    private _cardsChanged$ = this._cardsChanged.asObservable();
    private _snackMessageReceived = new Subject<string>();
    private _snackMessageReceived$ = this._snackMessageReceived.asObservable();

    answerCards: Interface.AnswerCard[] = [];

    @webrpc.Event()
    get snackMessageReceived() {
        return this._snackMessageReceived$;
    }

    sendSnackMessage(message: string) {
        setTimeout(() => this._snackMessageReceived.next(message), 100);
    }

    sendSnackMessageToOtherPlayers(message: string) {
        this.session.players
            .filter(x => x.player.id !== this.player.id)
            .forEach(player => player.sendSnackMessage(message))
        ;
    }

    @webrpc.Event()
    get judgementRequested() {
        return this._judgementRequested$;
    }

    @webrpc.Method()
    override async pickAnswer(answer: Interface.Answer) {
        await this.session.pickAnswer(this, answer);
    }

    @webrpc.Event()
    get cardsChanged(): Observable<Interface.AnswerCard[]> {
        return this._cardsChanged$;
    }

    @webrpc.Method()
    override async startNextRound() {
        this.session.startNextRound(this);
    }

    @webrpc.Method()
    override async submitAnswer(answerCards: Interface.AnswerCard[]): Promise<void> {
        await this.session.submitPlayerAnswer(this, answerCards);
    }

    @webrpc.Method()
    override async revealAnswer(answer: Interface.Answer) {
        this.session.revealAnswer(this, answer);
    }

    @webrpc.Method()
    override async getHand(): Promise<Interface.AnswerCard[]> {
        return this.answerCards;
    }

    
    @webrpc.Method()
    override async leaveGame(): Promise<void> {
        this.session.playerIsLeaving(this);
    }

    @webrpc.Method()
    override async setEnabledDecks(decks: Interface.Deck[]) {
        return await this.session.setEnabledDecks(this, decks);
    }

    @webrpc.Method()
    override async setGameRules(rules: Interface.GameRules) {
        await this.session.setGameRules(this, rules);
    }

    addCard(card: Interface.AnswerCard) {
        this.answerCards.push(card);
    }

    removeCards(cards: Interface.AnswerCard[]) {
        this.answerCards = this.answerCards.filter(x => !cards.some(y => y.id === x.id));
    }
    
    sendCards() {
        this._cardsChanged.next(this.answerCards);
    }
}

export interface PendingAnswer {
    player: PlayerSession;
    id: string;
    answerCards: Interface.AnswerCard[];
}

export class Game extends Interface.Game {
    constructor(readonly service: CardsAgainstService, readonly id: string) {
        super();
        this.availableAnswerCards = this.service.availableAnswers.slice();
        this.availablePrompts = this.service.availablePrompts.slice();
        this.enabledDecks = service.decks;
        this.gameRules = {
            czarIs: 'a-player',
            czarCanDeclareADraw: false,
            czarPlaysUpTo: 0,
            housePlaysUpTo: 3,
            leavingPlayerWill: "keep-hand"
        };
    }

    playerMap = new Map<string, PlayerSession>();
    round: Interface.Round;
    previousRounds: Interface.Round[] = [];
    pendingAnswers: PendingAnswer[] = [];
    host: PlayerSession;

    get players() {
        return Array.from(this.playerMap.values());
    }

    private _roundChanged = new BehaviorSubject<Interface.Round>(undefined);
    private _roundChanged$ = this._roundChanged.asObservable();

    @webrpc.Event()
    get roundChanged(): Observable<Interface.Round> {
        return this._roundChanged$;
    }

    idlePlayers: PlayerSession[] = [];

    sendAnnouncement(message: string) {
        this.players.forEach(player => player.sendSnackMessage(message));
    }

    removePlayer(player: PlayerSession) {
        this.idlePlayers.push(player);
        this.playerMap.delete(player.player.id);

        if (this.playerMap.size === 0) {
            this.service.deleteGame(this);
            return;
        }

        console.log(`[Game ${this.id}] Player ${player.player.id} ("${player.player.displayName}") has left the game.`);
        this.sendAnnouncement(`${player.player.displayName} has left the game.`)

        if (this.gameRules.leavingPlayerWill === 'lose-hand') {
            console.log(`[Game ${this.id}] -- Their hand will be burnt until reshuffle.`);
            player.answerCards = [];
        } else if (this.gameRules.leavingPlayerWill === 'return-hand') {
            console.log(`[Game ${this.id}] -- Their hand will be reshuffled into the deck.`);
            this.availableAnswerCards.push(...player.answerCards);
            player.answerCards = [];
        } else {
            console.log(`[Game ${this.id}] -- Their hand will be kept until they return.`);
        }

        if (this.round) {
            this.round.players = this.round.players.filter(x => x.id !== player.player.id);
            if (this.round.tsarPlayerId === player.player.id) {
                this.round.tsarPlayerId = this.round.players[this.tsarPlayerIndex = this.tsarPlayerIndex % this.round.players.length].id;
            }

            this._roundChanged.next(this.round);
            this.checkForAllAnswers();
        }
    }

    enterJudgingPhase() {
        let houseAnswersAdded = 0;
        while (this.round.answers.length < this.gameRules.housePlaysUpTo) {
            console.log(`[CAH] Adding house answer...`);
            let answer: PendingAnswer = {
                answerCards: this.dealCards(this.round.pick),
                player: null,
                id: uuid()
            };
            this.pendingAnswers.push(answer);
            this.round.answers.push({ 
                id: answer.id, 
                answerCards: answer.answerCards.map(x => ({ id: '', text: '', deck: <Interface.Deck>{ id: '',  name: '' } })),
                votes: []
            });
            houseAnswersAdded += 1;
        }

        if (houseAnswersAdded > 0)
            this.sendAnnouncement(`${houseAnswersAdded} house answers were added.`);

        this.round.phase = 'judging';
        this._roundChanged.next(this.round);
        this.checkForAllAnswerVotes();
    }

    startNextRound(player: PlayerSession) {
        if (this.round.phase !== 'finished')
            throw new Error(`The current round isn't finished yet!`);
        if (this.round.tsarPlayerId !== player.player.id)
            throw new Error(`You must be the Czar to start the next round`);

        this.startRound();
    }

    tsarPlayerIndex = -1;
    availablePrompts: BlackCard[];

    pickPrompt() {
        let deck = this.availablePrompts.filter(x => this.isDeckEnabledById(x.deckId));
        if (deck.length === 0) {
            this.availablePrompts = this.service.availablePrompts.slice();
            deck = this.availablePrompts.filter(x => this.isDeckEnabledById(x.deckId));
        }

        let indexInDeck = Math.random() * deck.length | 0;
        let card = deck[indexInDeck];
        let indexInPool = this.availablePrompts.indexOf(card)
        this.availablePrompts.splice(indexInPool, 1);

        if (!card) {
            throw new Error(`Cannot pick prompt: No prompts available (even after reshuffling!). This deck must not have any prompts!`);
        }

        return card;
    }

    async getPreviousRounds() {
        return this.previousRounds;
    }

    maxPreviousRounds = 50;

    /**
     * Start a new round immediately, regardless of what phase we are currently in.
     */
    startRound() {
        let prompt = this.pickPrompt();
        if (!prompt) {
            console.error(`[CAH] Failed to locate a prompt for this round! There were ${this.availablePrompts.length} unused prompts.`);
            throw new Error(`Could not find a prompt! I guess the game is over?`);
        }

        this.pendingAnswers = [];
        console.log(`[CAH] Round starting: ${prompt.text}`);

        if (this.round) {
            this.previousRounds.unshift(this.round);
            this.previousRounds.splice(this.maxPreviousRounds, this.previousRounds.length);
        }

        this.round = {
            host: this.host.player,
            answers: [],
            phase: 'answering',
            players: this.players.map(x => x.player),
            prompt: prompt.text,
            promptDeck: this.service.decks.find(x => x.id === prompt.deckId),
            pick: prompt.pick,
            tsarPlayerId: this.players[(this.tsarPlayerIndex = (this.tsarPlayerIndex + 1) % this.players.length)].player.id,
            gameRules: this.gameRules,
            enabledDecks: this.enabledDecks,
            winner: undefined
        }
        this._roundChanged.next(this.round);

        for (let player of this.players)
            this.dealCardsToPlayer(player);
        
        this.checkForAllAnswers();
    }

    async playerIsLeaving(player: PlayerSession) {
        this.removePlayer(player);
    }

    async revealAnswer(player: PlayerSession, revealedAnswer: Interface.Answer) {
        let answer = this.round.answers.find(x => x.id === revealedAnswer.id);
        let pendingAnswer = this.pendingAnswers.find(x => x.id === revealedAnswer.id);

        answer.answerCards = pendingAnswer.answerCards;
        this._roundChanged.next(this.round);
    }

    async setAnswer(answer: Interface.Answer) {
        let pendingAnswer = this.pendingAnswers.find(x => x.id === answer.id);
        this.round.phase = 'finished';
        this.round.winner = pendingAnswer.player?.player;
        this.round.winningAnswer = answer;
        this._roundChanged.next(this.round);
    }

    async pickAnswer(player: PlayerSession, answer: Interface.Answer) {
        if (!player)
            throw new Error(`Must pass a player!`);

        if (this.round.phase !== 'judging')
            throw new Error(`It's not time to pick an answer!`);

        if (this.round.answers.some(x => !x.answerCards))
            throw new Error(`Not all answers have been revealed yet!`);

        if (this.gameRules.czarIs === 'a-player' && player.player.id !== this.round.tsarPlayerId)
            throw new Error(`You are not the Czar!`);

        if (this.gameRules.czarIs === 'the-audience')
            throw new Error(`You are not the Czar! The Audience is the Czar!`);
        
        if (this.gameRules.czarIs === 'a-player') {
            this.setAnswer(answer);
        } else {
            // Czar is "the players"
            let existingAnswer = this.round.answers.find(x => x.id === answer.id);
            existingAnswer.votes.push(player.player.id);
            this._roundChanged.next(this.round);
            this.checkForAllAnswerVotes();
        }
    }

    get voterIds() {
        return this.round.answers.map(x => x.votes).flat();
    }

    checkForAllAnswerVotes() {
        if (this.players.length > 0 && this.players.every(x => this.voterIds.includes(x.player.id))) {
            this.pickAnswerByVote();
        }
    }

    pickAnswerByVote() {
        let maxVotes = this.round.answers.reduce((max, answer) => Math.max(max, answer.votes.length), 0);
        let winners = this.round.answers.filter(x => x.votes.length === maxVotes);

        if (winners.length > 1) {
            // Instant run off
            this.round.answers.filter(x => !winners.includes(x)).forEach(x => x.eliminated = true);
            this.round.answers.forEach(answer => answer.votes = []);
            this.sendAnnouncement(`Instant runoff! Pick from ${winners.length} choices which each got ${maxVotes} ${maxVotes === 1 ? 'vote' : 'votes'} last round.`)
            this._roundChanged.next(this.round);
        } else if (winners.length === 1) {
            this.setAnswer(winners[0]);
        } else {
            console.error(`[Game ${this.id}] BUG: Nothing won during czar-is:the-players`);
        }
    }

    async submitPlayerAnswer(player: PlayerSession, answerCards: Interface.AnswerCard[]) {
        if (this.pendingAnswers.some(x => x.player === player))
            throw new Error(`You've already submitted an answer`);

        if (this.round.gameRules.czarIs === 'a-player' && player.player.id === this.round.tsarPlayerId && !this.czarIsPlaying)
            throw new Error(`You are the Czar, and the Czar cannot play a card right now`);
        
        console.log(`[CAH] Player ${player.player.displayName} submitted an answer.`);
        
        let id = player.player.id;
        this.pendingAnswers.push({ id, player, answerCards });
        this.round.answers.push({ 
            id, 
            answerCards: answerCards.map(x => ({ id: '', text: '', deck: <Interface.Deck>{ id: '',  name: '' } })),
            votes: []
        });
        this.round.answers.sort((a, b) => Math.random() > 0.5 ? 1 : -1);
        this._roundChanged.next(this.round);
        
        player.removeCards(answerCards);
        player.sendCards();

        this.checkForAllAnswers();
    }

    get czarIsPlaying() {
        if (this.gameRules.czarIs !== 'a-player')
            return true;
        
        return this.players.length < this.gameRules.czarPlaysUpTo;
    }

    checkForAllAnswers() {
        let unansweredPlayers = this.players.filter(x => !this.hasAnswered(x));
        if (!this.czarIsPlaying)
            unansweredPlayers = unansweredPlayers.filter(x => x.player.id !== this.round.tsarPlayerId);

        if (unansweredPlayers.length === 0) {
            console.log(`[CAH] Entering judging period.`);
            this.enterJudgingPhase();
        } else {
            console.log(`[CAH] Waiting on ${unansweredPlayers.length} players (${unansweredPlayers.map(x => x.player.displayName).join(', ')})`);
        }
    }
    
    hasAnswered(player: PlayerSession) {
        return this.round.answers.some(x => x.id === player.player.id);
    }

    @webrpc.Method()
    async getId(): Promise<string> {
        return this.id;
    }

    @webrpc.Method()
    async join(id: string, displayName: string): Promise<Interface.PlayerSession> {
        let firstPlayer = this.playerMap.size === 0;
        let session = this.playerMap.get(id);
        let idleSession = this.idlePlayers.find(x => x.player.id === id);

        if (!session && idleSession) {
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has rejoined after previously leaving the game.`);
            session = idleSession;
            let returned = this.removeIllegalCardsFromPlayer(session);

            if (returned.length > 0) {
                session.sendSnackMessage(`Welcome back! ${returned.length} cards from your hand were removed because the deck changed.`)
            } else {
                session.sendSnackMessage(`Welcome back! The cards in your hand are as they were when you left.`)
            }
            session.sendSnackMessageToOtherPlayers(`${displayName} has returned to the game.`);
        } else if (!session) {
            session = new PlayerSession(this, { id, displayName });
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has joined.`);

            session.sendSnackMessage(`You have joined the game.`);
            session.sendSnackMessageToOtherPlayers(`${displayName} has joined the game.`);
        } else {
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has rejoined.`);
        }

        this.playerMap.set(id, session);
        session.player.displayName = displayName;
        this.dealCardsToPlayer(session);
        session.addConnection(RPCSession.current());

        if (firstPlayer) {
            this.host = session;
            this.startRound();
        } else {
            this.round.players = this.players.map(x => x.player);
            this._roundChanged.next(this.round);
        }
    
        return session;
    }

    availableAnswerCards: Interface.AnswerCard[];

    dealCards(count: number) {
        let cards = [];
        while (cards.length < count)
            cards.push(this.dealCard());

        return cards;
    }

    dealCard() {
        if (this.availableAnswerCards.length === 0)
            this.availableAnswerCards = this.service.availableAnswers.slice();

        let deck = this.availableAnswerCards.filter(x => this.isDeckEnabledById(x.deck.id));
        let deckIndex = Math.random() * deck.length | 0;
        let card = deck[deckIndex];

        if (!card)
            throw new Error(`Failed to deal a card even after reshuffling! The deck must not have any answer cards!`);

        let poolIndex = this.availableAnswerCards.indexOf(card);
        this.availableAnswerCards.splice(poolIndex, 1);

        return card;
    }

    dealCardsToPlayer(player: PlayerSession) {
        let dealt = 0;
        while (player.answerCards.length < 10) {
            let card = this.dealCard();
            player.addCard(card);
            dealt += 1;
        }

        if (dealt > 0)
            console.log(`[CAH] Dealt ${dealt} cards to ${player.player.displayName}. Player now has ${player.answerCards.length} cards.`);
        player.sendCards();
    }
    
    enabledDecks: Interface.Deck[] = [];
    gameRules: Interface.GameRules;

    @webrpc.Method()
    override async getEnabledDecks(): Promise<Interface.Deck[]> {
        return this.enabledDecks;
    }

    async setGameRules(player: PlayerSession, rules: Interface.GameRules) {
        if (this.host !== player)
            throw new Error(`Only the host can change the rules of the game.`);
        this.gameRules = rules;
        this.round.gameRules = rules;
        this._roundChanged.next(this.round);
    }

    @webrpc.Method()
    override async getGameRules(): Promise<Interface.GameRules> {
        return this.gameRules;
    }

    async setEnabledDecks(player: PlayerSession, decks: Interface.Deck[]) {
        if (this.round.host.id !== player.player.id) {
            throw new Error(`You must be the host of the game to change settings.`);
        }

        if (decks.length === 0) {
            throw new Error(`You must enable at least one deck!`);
        }

        let realizedDecks = decks.map(x => this.service.decks.find(y => x.id === y.id));
        if (realizedDecks.some(x => !x))
            throw new Error(`One or more deck IDs are invalid!`);

        let answerCount = realizedDecks.map(x => x.answerCount).reduce((s, v) => s + v, 0);
        let promptCount = realizedDecks.map(x => x.promptCount).reduce((s, v) => s + v, 0);

        if (answerCount === 0)
            throw new Error(`Your selected deck has no white (answer) cards! Add more decks.`);
        if (answerCount < 50)
            throw new Error(`Your selected deck must have at least 50 white (answer) cards. Your custom deck currently has ${answerCount} white cards.`);
        if (promptCount === 0)
            throw new Error(`Your selected deck has no black (prompt) cards! You must have at least one black card in your custom deck to play the game.`);

        console.log(`[CAH] ${realizedDecks.length} decks are now enabled.`);
        this.enabledDecks = realizedDecks;

        // Return all disabled cards from players' hands and deal replacements

        this.removeAllIllegalCards();

        if (this.round?.promptDeck?.id && !this.isDeckEnabledById(this.round.promptDeck.id)) {
            console.log(`[CAH] Current prompt is outside of enabled decks, starting a new round!`);
            this.startRound();
        }

        this.round.enabledDecks = this.enabledDecks;
        this._roundChanged.next(this.round);
    }

    removeAllIllegalCards() {
        for (let player of this.players) {
            this.removeIllegalCardsFromPlayer(player);
        }
    }

    /**
     * Find all cards in the given player's hand which are not part of the current deck, remove them
     * from their hand, replace them with fresh cards, and return the set of confiscated cards.
     * @param player 
     * @returns 
     */
    removeIllegalCardsFromPlayer(player: PlayerSession) {
        let returned = player.answerCards.filter(x => !this.isDeckEnabledById(x.deck.id));
        this.availableAnswerCards.push(...returned);
        player.answerCards = player.answerCards.filter(x => this.isDeckEnabledById(x.deck.id));
        this.dealCardsToPlayer(player);

        return returned;
    }

    isDeckEnabledById(id: string) {
        return this.enabledDecks
            .map(x => x.id)
            .includes(id)
        ;
    }

}

@WebService({
    server: {
        port: 3044
    }
})
@webrpc.Name('dev.rezonant.cardsagainst')
export class CardsAgainstService extends Interface.CardsAgainstService {
    async altOnInit() {
        let sets: CardSet[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'cah-cards-full.json')).toString('utf-8'));

        for (let set of sets) {
            let deckId = uuid();
            let deck: Interface.Deck = {
                id: deckId,
                name: set.name,
                description: set.description,
                official: set.official,
                promptCount: set.black.length,
                answerCount: set.white.length
            };
            this.decks.push(deck)
            this.availablePrompts.push(...set.black.map(x => ({ id: uuid(), deckId, ...x })));
            this.availableAnswers.push(...set.white.map(x => ({ id: uuid(), deck, deckId, ...x })));
        }

        //this.availablePrompts = this.availablePrompts.filter(x => x.pick > 1);
        console.log(`Loaded ${this.availablePrompts.length} prompts and ${this.availableAnswers.length} answers.`);
    }

    decks: Interface.Deck[] = [];
    availablePrompts: BlackCard[] = [];
    availableAnswers: Interface.AnswerCard[] = [];

    deleteGame(game: Game) {
        this.sessions.delete(game.id);
    }

    @webrpc.Method()
    override async getDecks() {
        return this.decks;
    }

    @Get()
    async endpoint() {
        if (WebEvent.request.headers.upgrade) {
            let socket = await WebServer.startSocket();
            let session = new RPCSession(new SocketChannel(socket));
            //session.loggingEnabled = true;
            //session.tag = WebEvent.request['ip'];
            session.registerService(CardsAgainstService, () => this);
        }
    }
    
    sessions = new Map<string, Game>;

    @webrpc.Method()
    override async findSession(id: string): Promise<Interface.Game> {
        return this.sessions.get(id);
    }

    @webrpc.Method()
    override async createSession(): Promise<Interface.Game> {
        let session = new Game(this, uuid());
        this.sessions.set(session.id, session);
        return session;
    }
}

Application.bootstrap(CardsAgainstService);