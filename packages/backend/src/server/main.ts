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
    constructor(readonly session: Session, readonly player: Interface.Player) {
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
    answerCards: Interface.AnswerCard[] = [];

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
        this.session.submitPlayerAnswer(this, answerCards);
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
        this.session.setEnabledDecks(this, decks);
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

export class Session extends Interface.Session {
    constructor(readonly service: CardsAgainstService, readonly id: string) {
        super();
        this.availableAnswerCards = this.service.availableAnswers;
        this.availablePrompts = this.service.availablePrompts;
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

    removePlayer(player: PlayerSession) {
        this.playerMap.delete(player.player.id);

        if (this.playerMap.size === 0) {
            this.service.deleteGame(this);
            return;
        }



        if (this.round) {
            this.round.players = this.round.players.filter(x => x.id !== player.player.id);
            if (this.round.tsarPlayerId === player.player.id) {
                this.round.tsarPlayerId = this.round.players[this.tsarPlayerIndex = this.tsarPlayerIndex % this.round.players.length].id;
            }

            let unansweredPlayers = this.players.filter(x => !this.hasAnswered(x));

            if (this.round.phase === 'answering' && unansweredPlayers.length === 0) {
                this.round.phase = 'judging';
                this._roundChanged.next(this.round);
            }

            this._roundChanged.next(this.round);
        }
    }

    startNextRound(player: PlayerSession) {
        if (this.round.phase !== 'finished')
            throw new Error(`The current round isn't finished yet!`);
        if (this.round.tsarPlayerId !== player.player.id)
            throw new Error(`You must be the host to start the next round`);

        this.startRound();
    }

    tsarPlayerIndex = -1;
    availablePrompts: BlackCard[];

    pickPrompt() {
        let deck = this.availablePrompts.filter(x => this.isDeckEnabledById(x.deckId));
        let indexInDeck = Math.random() * deck.length | 0;
        let card = deck[indexInDeck];
        let indexInPool = this.availablePrompts.indexOf(card)
        this.availablePrompts.splice(indexInPool, 1);
        
        if (!card)
            debugger;
        return card;
    }

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
            this.dealCards(player);
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

    async pickAnswer(player: PlayerSession, answer: Interface.Answer) {
        if (this.round.phase !== 'judging')
            throw new Error(`It's not time to pick an answer!`);

        if (this.round.answers.some(x => !x.answerCards))
            throw new Error(`Not all answers have been revealed yet!`);

        let pendingAnswer = this.pendingAnswers.find(x => x.id === answer.id);
        this.round.phase = 'finished';
        this.round.winner = pendingAnswer.player.player;
        this.round.winningAnswer = answer;
        this._roundChanged.next(this.round);
    }

    async submitPlayerAnswer(player: PlayerSession, answerCards: Interface.AnswerCard[]) {
        if (this.pendingAnswers.some(x => x.player === player))
            throw new Error(`You've already submitted an answer`);

        console.log(`[CAH] Player ${player.player.displayName} submitted an answer.`);
        
        let id = player.player.id;
        this.pendingAnswers.push({ id, player, answerCards });
        this.round.answers.push({ id, answerCards: answerCards.map(x => ({ id: '', text: '', deck: <Interface.Deck>{ id: '',  name: '' } })) });
        this.round.answers.sort((a, b) => Math.random() > 0.5 ? 1 : -1);
        this._roundChanged.next(this.round);
        
        player.removeCards(answerCards);
        player.sendCards();

        let unansweredPlayers = this.players.filter(x => !this.hasAnswered(x));

        if (unansweredPlayers.length === 0) {
            console.log(`[CAH] Entering judging period.`);
            this.round.phase = 'judging';
            this._roundChanged.next(this.round);
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

        if (!session) {
            session = new PlayerSession(this, { id, displayName });
            this.dealCards(session);
            this.playerMap.set(id, session);
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has joined.`);
        } else {
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has rejoined.`);

            session.player.displayName = displayName;
        }

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

    dealCards(player: PlayerSession) {
        let dealt = 0;
        while (player.answerCards.length < 10) {
            let deck = this.availableAnswerCards.filter(x => this.isDeckEnabledById(x.deck.id));
            let deckIndex = Math.random() * deck.length | 0;
            let card = deck[deckIndex];
            let poolIndex = this.availableAnswerCards.indexOf(card);
            this.availableAnswerCards.splice(poolIndex, 1);
            
            player.addCard(card);
            dealt += 1;
        }

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

        let realizedDecks = decks.map(x => this.service.decks.find(y => x.id === y.id));
        if (realizedDecks.some(x => !x))
            throw new Error(`One or more deck IDs are invalid!`);
        
        console.log(`[CAH] ${realizedDecks.length} decks are now enabled.`);
        this.enabledDecks = realizedDecks;

        // Return all disabled cards from players' hands and deal replacements

        for (let player of this.players) {
            let returned = player.answerCards.filter(x => !this.isDeckEnabledById(x.deck.id));
            this.availableAnswerCards.push(...returned);
            player.answerCards = player.answerCards.filter(x => this.isDeckEnabledById(x.deck.id));
            this.dealCards(player);
        }

        if (this.round?.promptDeck?.id && !this.isDeckEnabledById(this.round.promptDeck.id)) {
            console.log(`[CAH] Current prompt is outside of enabled decks, starting a new round!`);
            this.startRound();
        }

        this.round.enabledDecks = this.enabledDecks;
        this._roundChanged.next(this.round);
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
            let deck = {
                id: deckId,
                name: set.name,
                description: set.description,
                official: set.official
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

    deleteGame(game: Session) {
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
    
    sessions = new Map<string, Session>;

    @webrpc.Method()
    override async findSession(id: string): Promise<Interface.Session> {
        return this.sessions.get(id);
    }

    @webrpc.Method()
    override async createSession(): Promise<Interface.Session> {
        let session = new Session(this, uuid());
        this.sessions.set(session.id, session);
        return session;
    }
}

Application.bootstrap(CardsAgainstService);